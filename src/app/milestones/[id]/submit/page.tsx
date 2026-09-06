import { SubmitWorkView } from "./SubmitWorkView";

export default async function SubmitWorkPage(props: PageProps<"/milestones/[id]/submit">) {
  const { id } = await props.params;
  return <SubmitWorkView milestoneId={id} />;
}
