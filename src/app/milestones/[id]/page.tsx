import { MilestoneDetailView } from "./MilestoneDetailView";

export default async function MilestoneDetailPage(props: PageProps<"/milestones/[id]">) {
  const { id } = await props.params;
  return <MilestoneDetailView milestoneId={id} />;
}
