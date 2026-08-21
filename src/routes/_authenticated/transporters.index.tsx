import { createFileRoute } from "@tanstack/react-router";
import { PartyMasterPage } from "@/components/party-master";

export const Route = createFileRoute("/_authenticated/transporters/")({
  component: () => (
    <PartyMasterPage
      kind="transporter"
      title="Transporters"
      description="Click a nickname to open the transporter working page."
      detailRoute="/transporters/$id"
    />
  ),
});
