import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function LandingPage() {
  return (
    <div>
      <Hero />
      <Problem />
      <HowItWorks />
      <WhyGenLayer />
      <TrustTransparency />
      <Flows />
      <ExampleDispute />
      <Security />
      <FAQ />
      <FinalCTA />
    </div>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
      <Badge tone="info">Built on GenLayer</Badge>
      <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
        Decentralized escrow for freelance work, evaluated by GenLayer.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-600">
        Clients lock milestone payments in escrow. Freelancers submit deliverables. Instead of a single
        centralized &ldquo;approve&rdquo; button, GenLayer&rsquo;s Intelligent Contracts evaluate the
        submitted evidence against the requirements you agreed on, and decentralized validators reach
        consensus on the result before funds move.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/milestones/new">
          <Button size="lg">Create Milestone</Button>
        </Link>
        <Link href="/demo">
          <Button size="lg" variant="outline">
            Explore Demo
          </Button>
        </Link>
      </div>
    </section>
  );
}

function Problem() {
  const questions = [
    "Did the freelancer actually satisfy the requirements?",
    "Does the submitted website match what was agreed?",
    "Does the submitted code actually work?",
    "Should the escrow be released, or refunded?",
  ];
  return (
    <section className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">The problem</h2>
        <p className="mt-2 max-w-2xl text-2xl font-semibold text-slate-900">
          &ldquo;Completed&rdquo; is often subjective.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {questions.map((q) => (
            <li key={q} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {q}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Agree on requirements",
    body: "Client and freelancer agree on structured, weighted requirements for the milestone — not a vague description.",
  },
  {
    title: "Fund escrow",
    body: "The client deposits the milestone amount. Requirements become immutable the moment funds are locked.",
  },
  {
    title: "Submit deliverables",
    body: "The freelancer submits a deployed URL, repository, screenshots, and/or documents as evidence.",
  },
  {
    title: "GenLayer evaluates",
    body: "An Intelligent Contract fetches and reads the evidence, and classifies each requirement as PASS, FAIL, PARTIAL, or UNVERIFIABLE.",
  },
  {
    title: "Validators reach consensus",
    body: "Multiple independent validators run the evaluation and must agree on the structured result before it's accepted.",
  },
  {
    title: "Escrow resolves automatically",
    body: "A plain, deterministic rule reads the finalized result: meet the threshold, funds release to the freelancer; otherwise, they're refunded to the client.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">How it works</h2>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          Requirements → Evidence → Evaluation → Consensus → Payout
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title}>
              <CardContent>
                <span className="text-xs font-semibold text-slate-400">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-1 font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhyGenLayer() {
  return (
    <section className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Why GenLayer</h2>
        <p className="mt-2 max-w-2xl text-2xl font-semibold text-slate-900">
          A normal smart contract can custody funds. It can&rsquo;t read a website.
        </p>
        <p className="mt-4 max-w-2xl text-slate-600">
          Judging whether a deployed site is responsive, whether a contact form exists, or whether code in a
          repository actually works requires interpreting unstructured, real-world evidence — something a
          conventional deterministic contract cannot do on its own. WorkResolve uses GenLayer&rsquo;s
          Intelligent Contracts to run that judgment as a non-deterministic operation that multiple
          independent validators execute and must agree on, rather than trusting one centralized AI API call.
          The financial outcome is then read from that finalized, consensus-backed result by ordinary
          deterministic contract logic — the evaluation never has direct control over funds.
        </p>
      </div>
    </section>
  );
}

const ON_CHAIN = [
  "The milestone itself: client, freelancer, amount, deadline, state",
  "The requirements commitment (a hash of the exact requirements agreed at funding time)",
  "The escrow funds, held by the contract until settlement",
  "The submission's evidence URLs and freelancer notes",
  "The finalized evaluation result: per-requirement PASS/FAIL/PARTIAL/UNVERIFIABLE, score, decision",
  "Settlement: which of release or refund actually happened",
];

const OFF_CHAIN = [
  "The content behind evidence URLs itself — the live website, the repository, any linked document",
  "Large files or screenshots (WorkResolve never accepts raw file uploads on-chain — see docs/evaluation.md)",
];

function TrustTransparency() {
  return (
    <section className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Trust &amp; transparency
        </h2>
        <p className="mt-2 max-w-2xl text-2xl font-semibold text-slate-900">
          What&rsquo;s actually on-chain, and what isn&rsquo;t.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent>
              <h3 className="font-semibold text-slate-900">On-chain</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                {ON_CHAIN.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h3 className="font-semibold text-slate-900">Off-chain</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                {OFF_CHAIN.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">
                Off-chain content is still evaluated — GenLayer fetches it at evaluation time — it&rsquo;s just
                never stored on-chain itself, only referenced by URL.
              </p>
            </CardContent>
          </Card>
        </div>
        <p className="mt-6 max-w-2xl text-sm text-slate-600">
          <strong>Why GenLayer specifically:</strong> a normal deterministic smart contract can hold funds and
          enforce a state machine, but it has no native way to interpret an arbitrary real-world deliverable —
          whether a website looks responsive, whether a contact form works, whether a repository actually
          builds. That judgment call requires something that can read unstructured evidence, which is exactly
          what GenLayer&rsquo;s Intelligent Contracts add: a non-deterministic evaluation step that independent
          validators must reach consensus on, with the financial decision computed afterward by ordinary,
          fully deterministic code that never trusts the evaluator&rsquo;s own stated conclusion directly.
        </p>
      </div>
    </section>
  );
}

function Flows() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">For clients</h3>
            <ol className="mt-3 space-y-2 text-sm text-slate-600">
              <li>1. Define structured, weighted requirements for the work.</li>
              <li>2. Lock the agreed payment into escrow.</li>
              <li>3. Wait for the freelancer to submit deliverables.</li>
              <li>4. See a transparent, requirement-by-requirement evaluation before funds move.</li>
            </ol>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">For freelancers</h3>
            <ol className="mt-3 space-y-2 text-sm text-slate-600">
              <li>1. Accept a milestone with clear, fixed requirements.</li>
              <li>2. Do the work, then submit your deployed URL, repo, and evidence.</li>
              <li>3. Get evaluated against exactly what was agreed — nothing added after the fact.</li>
              <li>4. Get paid automatically once the evaluation clears the threshold.</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExampleDispute() {
  return (
    <section className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">Example</h2>
        <p className="mt-2 text-2xl font-semibold text-slate-900">Restaurant landing page, $100 milestone</p>
        <p className="mt-4 max-w-2xl text-slate-600">
          A client asks for a responsive restaurant landing page: a menu section, a contact form, a
          mobile-friendly layout, a working deployed URL, and a source repository. The freelancer submits
          their deployed site and GitHub link. GenLayer fetches both, checks each requirement individually,
          and returns a structured result — for example, four requirements PASS and one is PARTIAL because the
          contact form exists but isn&rsquo;t functional. If the weighted score clears the threshold, escrow
          releases automatically; if not, the client is refunded.
        </p>
      </div>
    </section>
  );
}

function Security() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          Security &amp; honest limits
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent>
              <h3 className="font-semibold text-slate-900">What&rsquo;s enforced on-chain</h3>
              <p className="mt-1.5 text-sm text-slate-600">
                Requirements are locked once escrow is funded. Funds can only be released or refunded once.
                Evaluation results, once finalized, cannot be altered.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <h3 className="font-semibold text-slate-900">What we don&rsquo;t claim</h3>
              <p className="mt-1.5 text-sm text-slate-600">
                WorkResolve does not guarantee a correct outcome in every case, does not provide legal
                arbitration, and does not claim its AI-assisted evaluation is perfect. Evidence that
                can&rsquo;t be verified is scored as unverifiable, not assumed to pass. Using GenLayer reduces
                — it does not eliminate — the trust placed in any single party&rsquo;s judgment.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    q: "Who decides if the work is approved?",
    a: "No single party does. An Intelligent Contract on GenLayer evaluates the submitted evidence against the agreed requirements, and multiple independent validators must reach consensus on the structured result before it's finalized.",
  },
  {
    q: "Can the client change the requirements after funding?",
    a: "No. Requirements are locked once the milestone is funded — there is no function that can modify them afterward.",
  },
  {
    q: "What happens if the deployed URL is down when it's evaluated?",
    a: "The relevant requirement is marked UNVERIFIABLE, not automatically passed or failed. Unverifiable evidence lowers the score rather than defaulting to approval.",
  },
  {
    q: "Is this legally binding arbitration?",
    a: "No. WorkResolve is an escrow and evaluation mechanism, not a legal dispute resolution service.",
  },
];

function FAQ() {
  return (
    <section id="faq" className="border-y border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">FAQ</h2>
        <div className="mt-4 divide-y divide-slate-200">
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="cursor-pointer list-none font-medium text-slate-900 marker:content-none">
                {item.q}
              </summary>
              <p className="mt-2 text-sm text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <h2 className="text-2xl font-semibold text-slate-900">Ready to try it?</h2>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">
          Create a milestone with your own requirements, or walk through the scripted Alice &amp; Bob demo to
          see the full evaluation flow end to end.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/milestones/new">
            <Button size="lg">Create Milestone</Button>
          </Link>
          <Link href="/demo">
            <Button size="lg" variant="outline">
              Explore Demo
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
