import { createFileRoute } from "@tanstack/react-router";
import { PartyMasterPage } from "@/components/party-master";

export const Route = createFileRoute("/_authenticated/dealers/")({
  component: () => (
    <PartyMasterPage
      kind="dealer"
      title="Dealers"
      description="Click a nickname to open the dealer working page."
      detailRoute="/dealers/$id"
    />
  ),
});
