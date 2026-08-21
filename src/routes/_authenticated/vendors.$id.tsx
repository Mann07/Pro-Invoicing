import { createFileRoute, useParams } from "@tanstack/react-router";
import { PartyDetailPage } from "@/components/party-detail";

export const Route = createFileRoute("/_authenticated/vendors/$id")({
  component: VendorDetail,
});

function VendorDetail() {
  const { id } = useParams({ from: "/_authenticated/vendors/$id" });
  return <PartyDetailPage kind="vendor" id={id} singular="Vendor" listRoute="/vendors" listLabel="Vendors" />;
}
