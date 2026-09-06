import { EvaluationView } from "./EvaluationView";

export default async function EvaluationPage(props: PageProps<"/milestones/[id]/evaluation">) {
  const { id } = await props.params;
  return <EvaluationView milestoneId={id} />;
}
