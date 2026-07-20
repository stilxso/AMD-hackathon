import { NextResponse } from "next/server";
import type { AnalyzeResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: Array<{ min: number; max: number; text: string }> = [
  { min: 15,  max: 45,  text: "Good" },
  { min: 55,  max: 95,  text: "Moderate" },
  { min: 105, max: 145, text: "Unhealthy for Sensitive Groups" },
  { min: 155, max: 195, text: "Unhealthy" },
  { min: 210, max: 275, text: "Very Unhealthy" },
];

const POLLUTANTS = ["PM2.5", "PM10", "NO2", "O3", "SO2", "CO"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }

  // artificial 3-4s delay so the scanning animation reads well on demo
  const delay = 3000 + Math.floor(Math.random() * 1000);
  await new Promise((r) => setTimeout(r, delay));

  const bucket = rand(STATUSES);
  const aqi = Math.floor(bucket.min + Math.random() * (bucket.max - bucket.min));
  const payload: AnalyzeResponse = {
    aqi_score: aqi,
    status_text: bucket.text,
    ai_confidence: Number((0.78 + Math.random() * 0.2).toFixed(2)),
    dominant_pollutant: rand(POLLUTANTS),
  };

  return NextResponse.json(payload);
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "POST multipart/form-data with fields: file, latitude, longitude" });
}
