import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
describe("contrato das regras do Firestore", () => {
  it("aceita somente cadastros pendentes de Cliente ou Consultor", () => {
    expect(rules).toContain("function validPendingRegistration()");
    expect(rules).toContain("request.resource.data.registrationStatus == 'pending'");
    expect(rules).toContain("request.resource.data.role == 'requester'");
    expect(rules).toContain("request.resource.data.role == 'consultant'");
    expect(rules).toContain("get(/databases/$(database)/documents/companies/$(request.resource.data.companyId)).data.active == true");
  });
  it("restringe o bootstrap ao e-mail proprietário e finaliza atomicamente", () => {
    expect(rules).toContain("function ownerCandidate()");
    expect(rules).toContain("bootstrapConfig/owner");
    expect(rules).toContain("getAfter(/databases/$(database)/documents/publicConfig/bootstrap).data.initialized == true");
    expect(rules).toContain("request.resource.data.role == 'admin'");
  });
  it("protege consultores por empresa e limita o vínculo próprio de empresas", () => {
    expect(rules).toContain("companyId in profile().companyIds");
    expect(rules).toContain("function consultantOwnCompanyLink(uid)");
    expect(rules).toContain("affectedKeys().hasOnly(['companyIds', 'updatedAt'])");
    expect(rules).toContain("allow update: if admin() || consultantOwnCompanyLink(uid);");
  });
});
