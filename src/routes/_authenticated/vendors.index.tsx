import { createFileRoute } from "@tanstack/react-router";
import { PartyMasterPage } from "@/components/party-master";

export const Route = createFileRoute("/_authenticated/vendors/")({
  component: () => (
    <PartyMasterPage
      kind="vendor"
      title="Vendors"
      description="Click a nickname to open the vendor working page."
      detailRoute="/vendors/$id"
    />
  ),
});
