/** جلسة مدير العيادة (كوكي لكلّ عيادة) — للصفحات وواجهات /api/c/[slug]/… */
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { DomainError } from "../domain/types";
import { clinicCookieName, readClinicSession } from "./auth";
import * as crepo from "./clinicsRepo";
import type { Clinic } from "./clinicsRepo";
import { now } from "./clock";
import { getDb } from "./db";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

export async function clinicBySlug(slug: string): Promise<Clinic | null> {
  const s = typeof slug === "string" ? slug.toLowerCase() : "";
  return SLUG_RE.test(s) ? crepo.getClinicBySlug(await getDb(), s) : null;
}

/** العيادة إن كانت جلسة مديرها صالحة، وإلّا null. */
export async function managerClinic(slug: string): Promise<Clinic | null> {
  const clinic = await clinicBySlug(slug);
  if (!clinic) return null;
  const s = readClinicSession((await cookies()).get(clinicCookieName(clinic.id))?.value, now());
  return s && s.clinicId === clinic.id && s.v === clinic.sessionVersion ? clinic : null;
}

export async function requireManager(slug: string): Promise<Clinic> {
  const c = await managerClinic(slug);
  if (!c) throw new DomainError("unauthorized", 401);
  return c;
}

export function setClinicCookie(res: NextResponse, clinic: Clinic, token: string) {
  res.cookies.set(clinicCookieName(clinic.id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 86400,
  });
}
