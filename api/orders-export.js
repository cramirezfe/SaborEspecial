import { getDb } from "../lib/mongodb.js";
import { handleOptions, setCors } from "../lib/http.js";

function validateAdminSecret(req, res) {
  const adminSecret = String(req.body?.adminSecret || "");
  const expectedSecret = String(process.env.ADMIN_SECRET || "");

  if (!expectedSecret) {
    res.status(500).json({ ok: false, message: "Missing ADMIN_SECRET in Vercel." });
    return false;
  }

  if (adminSecret !== expectedSecret) {
    res.status(401).json({ ok: false, message: "Clave administrativa incorrecta." });
    return false;
  }

  return true;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function flattenDocument(input, prefix = "", output = {}) {
  Object.keys(input || {}).forEach((key) => {
    const value = input[key];
    const nextKey = prefix ? `${prefix}.${key}` : key;

    if (value instanceof Date) {
      output[nextKey] = value.toISOString();
      return;
    }

    if (Array.isArray(value)) {
      output[nextKey] = JSON.stringify(value);
      return;
    }

    if (isPlainObject(value)) {
      flattenDocument(value, nextKey, output);
      return;
    }

    output[nextKey] = value ?? "";
  });

  return output;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(documents) {
  const flattened = documents.map((doc) => flattenDocument(doc));
  const headers = Array.from(
    flattened.reduce((set, item) => {
      Object.keys(item).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const lines = [
    headers.map(escapeCsv).join(",")
  ];

  flattened.forEach((item) => {
    lines.push(headers.map((header) => escapeCsv(item[header] ?? "")).join(","));
  });

  return "\uFEFF" + lines.join("\n");
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  setCors(res);

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  if (!validateAdminSecret(req, res)) return;

  try {
    const db = await getDb();
    const orders = await db.collection("orders")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const csv = buildCsv(orders);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"orders-export.csv\"");
    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message || "No fue posible exportar los pedidos."
    });
  }
}
