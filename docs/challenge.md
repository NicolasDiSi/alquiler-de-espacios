# Challenge: alquiler de salas de reuniones

Transcription of `challenge.pdf` (Fontanella SRL, Senior Full Stack challenge). This file is the source of truth
for agents; the PDF is not committed.

## 1. Context

A company rents meeting rooms to other companies. Today bookings are coordinated by messages and shared
spreadsheets, which causes:

- Different companies booking the same room for overlapping times.
- Clients have no simple way to see room availability.
- When a meeting is cancelled, it is not always clear the room is free again.
- The operator struggles to see how its facilities are used and which clients use them most.
- Manual coordination gets harder as clients grow.

The operator also wants better commercial decisions: promotions for some clients, growth opportunities, better
occupancy. It needs room utilization metrics, overall and per client company.

Goal: a first version of a web app to manage bookings centrally and get useful business information.

## 2. Business needs

### Bookings

Client companies must be able to:

- See the rooms and their availability.
- Book a room for a date and a time period.
- See and cancel their own bookings.
- Know the result of each operation and understand why a booking could not be made.

A room must never be booked for two overlapping meetings, **even if different clients try at the same time**.
Bookings must survive an application restart.

### Multiple companies

Each client company has its own bookings and must not access other companies' private information. The operator
needs an overall view of facility and client activity.

### Metrics and analysis

The operator needs information to:

- Understand how rooms and facilities are used.
- Analyze the behavior and utilization level of each client company.
- Identify opportunities for promotions or commercial incentives.
- Detect low utilization periods and ways to improve occupancy.

We are expected to propose and implement the metrics we consider relevant.

### Growth

Three rooms and a few clients at first; more facilities and companies later.

## 3. Scope

- A functional first version, not a finished product.
- Some business rules, UX decisions and implementation details are intentionally undefined: identify them, make
  reasonable decisions and **document the assumptions**.
- Secondary features may be simplified. They value the reasoning as much as the result.

## 4. Technical requirements

- Frontend: React with TypeScript.
- Backend: Node.js with TypeScript.
- Persistence, extra libraries, frameworks and testing tools: our choice.
- Must run locally following the repository instructions.
- Automated tests for the behaviors we consider critical.
- No full authentication system, cloud infrastructure or production deploy required.
- Project organization, API design, data model, architecture and how companies are represented: our choice.

## 5. Use of AI

AI tools are allowed and expected. We own the code and the decisions. The README must include a short section with:

- Which tools were used.
- Which tasks were delegated to agents or assistants.
- Which AI generated decisions, proposals or code were corrected, changed or discarded, and briefly why.

No full conversations needed. The interview will dig into these decisions and the process.

## 6. Deadline

72 hours from receiving the challenge. Prioritization and a functional, quality implementation matter more than
being exhaustive.

## 7. Deliverables

A Git repository with:

- Source code.
- Automated tests.
- README with instructions to run and test the project.
- A short explanation of the main architecture and design decisions.
- Assumptions, known limitations and improvements for a next version.
- A short section on AI use (section 5).

**Commit history:** a reasonable history that shows how the implementation evolved, with commits for meaningful
steps, not a single final commit.

## 8. Evaluation criteria

- Quality and correctness of the solution.
- Technical decisions and their justification.
- Robustness of the critical features.
- Solving the needs of a system used by multiple companies.
- Clarity and maintainability of the code.
- Quality of the automated tests.
- Usefulness for the business.
- Judgement in using, supervising and validating AI tools.

The interview will ask to explain the implementation, its decisions and possible changes to it.
