export type ModuleId = "dealer" | "vendor" | "transporter" | "customer";

export const MODULES = [
  { id: "dealer", label: "Dealers", singular: "Dealer", table: "dealers", route: "/dealers" },
  { id: "vendor", label: "Vendors", singular: "Vendor", table: "vendors", route: "/vendors" },
  { id: "transporter", label: "Transporters", singular: "Transporter", table: "transporters", route: "/transporters" },
  { id: "customer", label: "Customers", singular: "Customer", table: null, route: "/customers" },
] as const;

export function moduleInfo(id: ModuleId) {
  return MODULES.find((m) => m.id === id)!;
}
