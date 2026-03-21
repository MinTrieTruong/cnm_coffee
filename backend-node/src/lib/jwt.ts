import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export type CustomerPayload = { typ: "cust"; sub: number };
export type StaffPayload = { typ: "staff"; sub: number; role: string };

export function signCustomerToken(customerId: number) {
  return jwt.sign({ typ: "cust", sub: customerId } as CustomerPayload, JWT_SECRET, { expiresIn: "30d" });
}

export function signStaffToken(staffId: number, role: string) {
  return jwt.sign({ typ: "staff", sub: staffId, role } as StaffPayload, JWT_SECRET, { expiresIn: "12h" });
}

export function verifyToken<T extends CustomerPayload | StaffPayload>(token: string): T {
  return jwt.verify(token, JWT_SECRET) as unknown as T;
}
