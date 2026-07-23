import { createFileRoute } from "@tanstack/react-router";
import { PartyMasterPage } from "@/components/party-master";

export const Route = createFileRoute("/_authenticated/transporters")({
  component: () => (
    <PartyMasterPage
      kind="transporter"
      title="Transporters"
      description="Transporter master with independent numbering, templates, and reports."
      detailRoute="/transporters/$id"
    />
  ),
});
