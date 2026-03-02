#!/usr/bin/env node
/**
 * otel-grpc.js — OTLP/gRPC transport for log records.
 *
 * Sends ExportLogsServiceRequest over gRPC (HTTP/2 + protobuf) to an
 * OTEL Collector's gRPC endpoint (typically port 4317).
 *
 * Zero dependencies — uses Node.js built-in http2 module and manual
 * protobuf encoding based on the official OTLP proto field numbers.
 *
 * Proto references:
 *   opentelemetry/proto/collector/logs/v1/logs_service.proto
 *   opentelemetry/proto/logs/v1/logs.proto
 *   opentelemetry/proto/common/v1/common.proto
 *   opentelemetry/proto/resource/v1/resource.proto
 */

const http2 = require("http2");

// ─── Protobuf Wire Format Primitives ───

const VARINT = 0;
const FIXED64 = 1;
const LEN = 2;

function fieldTag(num, wireType) {
  return encodeVarint((num << 3) | wireType);
}

function encodeVarint(n) {
  const buf = [];
  n = Number(n);
  do {
    let byte = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    buf.push(byte);
  } while (n > 0);
  return Buffer.from(buf);
}

function encodeFixed64(bigintVal) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(bigintVal));
  return buf;
}

function encodeDouble(val) {
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(val);
  return buf;
}

// ─── Protobuf Field Encoders ───

function stringField(num, str) {
  if (!str) return Buffer.alloc(0);
  const bytes = Buffer.from(str, "utf8");
  return Buffer.concat([fieldTag(num, LEN), encodeVarint(bytes.length), bytes]);
}

function varintField(num, val) {
  val = Number(val);
  if (!val) return Buffer.alloc(0);
  return Buffer.concat([fieldTag(num, VARINT), encodeVarint(val)]);
}

function fixed64Field(num, bigintVal) {
  bigintVal = BigInt(bigintVal);
  if (bigintVal === 0n) return Buffer.alloc(0);
  return Buffer.concat([fieldTag(num, FIXED64), encodeFixed64(bigintVal)]);
}

function doubleField(num, val) {
  if (!val) return Buffer.alloc(0);
  return Buffer.concat([fieldTag(num, FIXED64), encodeDouble(val)]);
}

function messageField(num, msgBytes) {
  if (!msgBytes || !msgBytes.length) return Buffer.alloc(0);
  return Buffer.concat([
    fieldTag(num, LEN),
    encodeVarint(msgBytes.length),
    msgBytes,
  ]);
}

// ─── OTLP Proto Message Builders ───
// Field numbers sourced from opentelemetry-proto (see header).

function encodeAnyValue(av) {
  if (av.stringValue != null) return stringField(1, av.stringValue);
  if (av.intValue != null) return varintField(3, av.intValue);
  if (av.doubleValue != null) return doubleField(4, av.doubleValue);
  if (av.boolValue != null) return varintField(2, av.boolValue ? 1 : 0);
  return Buffer.alloc(0);
}

function encodeKeyValue(kv) {
  return Buffer.concat([
    stringField(1, kv.key),
    messageField(2, encodeAnyValue(kv.value)),
  ]);
}

function encodeResource(res) {
  return Buffer.concat(
    (res.attributes || []).map((a) => messageField(1, encodeKeyValue(a)))
  );
}

function encodeInstrumentationScope(scope) {
  return Buffer.concat([
    stringField(1, scope.name),
    scope.version ? stringField(2, scope.version) : Buffer.alloc(0),
  ]);
}

// LogRecord field numbers: 1=time_unix_nano(fixed64), 2=severity_number(enum),
// 3=severity_text(string), 5=body(AnyValue), 6=attributes(repeated KeyValue)
function encodeLogRecord(lr) {
  return Buffer.concat([
    fixed64Field(1, lr.timeUnixNano),
    varintField(2, lr.severityNumber),
    stringField(3, lr.severityText),
    lr.body ? messageField(5, encodeAnyValue(lr.body)) : Buffer.alloc(0),
    ...(lr.attributes || []).map((a) => messageField(6, encodeKeyValue(a))),
  ]);
}

function encodeScopeLogs(sl) {
  return Buffer.concat([
    sl.scope ? messageField(1, encodeInstrumentationScope(sl.scope)) : Buffer.alloc(0),
    ...(sl.logRecords || []).map((lr) => messageField(2, encodeLogRecord(lr))),
  ]);
}

function encodeResourceLogs(rl) {
  return Buffer.concat([
    rl.resource ? messageField(1, encodeResource(rl.resource)) : Buffer.alloc(0),
    ...(rl.scopeLogs || []).map((sl) => messageField(2, encodeScopeLogs(sl))),
  ]);
}

function encodeExportLogsRequest(payload) {
  return Buffer.concat(
    (payload.resourceLogs || []).map((rl) =>
      messageField(1, encodeResourceLogs(rl))
    )
  );
}

// ─── gRPC Transport ───

const GRPC_PATH =
  "/opentelemetry.proto.collector.logs.v1.LogsService/Export";

/**
 * Send an OTLP ExportLogsServiceRequest over gRPC.
 * @param {string} endpoint  e.g. "http://localhost:4317"
 * @param {object} payload   JSON object matching OTLP JSON log format
 */
function sendGrpc(endpoint, payload) {
  try {
    const proto = encodeExportLogsRequest(payload);

    // gRPC length-prefixed message: [compress:1byte][length:4bytes BE][proto]
    const frame = Buffer.alloc(5 + proto.length);
    frame[0] = 0;
    frame.writeUInt32BE(proto.length, 1);
    proto.copy(frame, 5);

    const url = new URL(endpoint);
    const session = http2.connect(url.origin);

    session.on("error", () => {
      try { session.close(); } catch (_) {}
    });

    const req = session.request({
      [http2.constants.HTTP2_HEADER_METHOD]: "POST",
      [http2.constants.HTTP2_HEADER_PATH]: GRPC_PATH,
      "content-type": "application/grpc",
      te: "trailers",
    });

    req.setTimeout(5000, () => {
      try {
        req.close();
        session.close();
      } catch (_) {}
    });

    req.on("error", () => {});
    req.on("end", () => {
      try { session.close(); } catch (_) {}
    });

    req.end(frame);
  } catch (_) {}
}

module.exports = { sendGrpc };
