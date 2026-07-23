import { createFileRoute } from "@tanstack/react-router";
import { PartyMasterPage } from "@/components/party-master";

export const Route = createFileRoute("/_authenticated/vendors")({
  component: () => (
    <PartyMasterPage
      kind="vendor"
      title="Vendors"
      description="Vendor master with independent numbering, templates, and reports."
      detailRoute="/vendors/$id"
    />
  ),
});
