import { createFileRoute, useParams } from "@tanstack/react-router";
import { PartyDetailPage } from "@/components/party-detail";

export const Route = createFileRoute("/_authenticated/transporters/$id")({
  component: TransporterDetail,
});

function TransporterDetail() {
  const { id } = useParams({ from: "/_authenticated/transporters/$id" });
  return (
    <PartyDetailPage kind="transporter" id={id} singular="Transporter" listRoute="/transporters" listLabel="Transporters" />
  );
}
