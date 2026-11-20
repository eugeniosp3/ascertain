# Full Stack: Take Home

# **Healthcare Dashboard**

[Open the version with red-font progress notes](project.html)

<span style="color: red;">Progress snapshot: 20 November 2026, 10:49–10:51 AM EST. Implementation continues; completion below reflects evidence available at that time.</span>

## **Overview**

Build a modern, scalable React (TypeScript) healthcare dashboard with a FastAPI backend and PostgreSQL database. This assessment evaluates your architectural decisions, technical choices, and ability to create maintainable and performant full-stack applications.

**Context**: You're building a patient management dashboard for a medical practice. The application will grow over time to include multiple user types, complex workflows, and real-time features.

**Time Estimate:** We recommend spending no more than 2-4 hours on this exercise. Complete as many core tasks and stretch goals as possible within that timeframe.

<span style="color: red;">We are building the patient dashboard with Vite/React, FastAPI and PostgreSQL. The 100-patient dataset is ready; frontend/backend integration is in progress. Discussion, note links and unread notifications are selected additions.</span>

**Submission Requirements**:

- Share a public GitHub repository.

  <span style="color: red;">Pending: public repository publication and a fresh-clone verification.</span>
- Comprehensive yet succinct `README.md`, with instructions to run locally.

  <span style="color: red;">Root and infra READMEs exist. Their database-only and skeleton descriptions need updating to match the latest code.</span>
- A functioning `docker-compose.yml` that can be used to launch the service easily.

  <span style="color: red;">Three-service Compose exists and the development containers are healthy. A clean compiled startup with real API data and automatic seeding is still pending.</span>

---

## **Evaluation Criteria**

We'll assess your submission based on:

- Technical decision-making: architecture, library choices, state management, performance optimizations

  <span style="color: red;">Typed APIs, reusable utilities and separate server, URL and UI state are in place. Performance results still need verification.</span>
- Code quality and employing best practices in software development

  <span style="color: red;">Lint, formatting, strict typing and test tooling are configured. Final checks must run against the assembled application.</span>
- API design and error handling

  <span style="color: red;">Required API routes and structured errors exist. Frontend/backend contracts still need alignment, especially unread comments.</span>
- Documentation and ease of local setup

  <span style="color: red;">Setup instructions and sample environment values exist; documentation needs reconciliation with current startup and seeding behavior.</span>
- Correctness and completeness of each part

  <span style="color: red;">Health, data validation and focused foundation tests pass. Complete patient journeys, persistence and production startup remain unverified.</span>
- Capability of understanding and applying requirements

  <span style="color: red;">Original requirements are retained here. Additional UI acceptance cases are recorded in <a href="../chatroom/frontend-updates.md" style="color: red;">frontend-updates.md</a>.</span>

---

## **Part 1: Project Foundation & Architecture**

Create a new React application and FastAPI backend from scratch, establishing your architectural foundation.

**Frontend Tasks:**

1. **Initialize your project,** preferably using Vite.

   <span style="color: red;">Vite/React/TypeScript scaffold exists. Missing page/workspace modules were still being implemented at this snapshot.</span>
2. **Choose and configure your core dependencies**:
    - UI framework/component library

      <span style="color: red;">Tailwind-styled shadcn/Radix components and design tokens are implemented.</span>
    - State management solution

      <span style="color: red;">TanStack Query owns API data; Zustand owns shared UI preferences and return-to-list state.</span>
    - Routing solution

      <span style="color: red;">TanStack Router declares the required routes; complete route rendering remains under construction.</span>
    - Styling approach

      <span style="color: red;">Tailwind and the Ascertain design tokens are configured in <a href="../frontend/src/styles/globals.css" style="color: red;">globals.css</a>.</span>
3. **Set up development tooling**:
    - Linting and formatting

      <span style="color: red;">ESLint and Prettier configuration/scripts exist; the full assembled-app checks are pending.</span>
    - TypeScript configuration

      <span style="color: red;">Strict TypeScript is configured; final typecheck depends on the remaining frontend modules.</span>

**Backend Tasks:**

1. **Initialize a FastAPI application** with a health-check endpoint (`GET /health`) returning `{"status": "ok"}`.

   <span style="color: red;">Verified: both an in-process check and the running API returned HTTP 200 with exactly {"status":"ok"}.</span>
2. **Set up PostgreSQL** with a schema for storing patients. Ensure another developer can easily recreate this database (migrations or init scripts).

   <span style="color: red;">PostgreSQL is running. SQLAlchemy models and the initial Alembic migration exist; clean migration and schema verification remain pending.</span>
3. **Seed the database** with realistic sample data (15-20 patients minimum) on startup.

   <span style="color: red;">Bronze/silver DuckDB contain 100 validated patients; all 21 data checks and 18 backend source-loader checks passed. <a href="../backend/app/seed.py" style="color: red;">app.seed</a> reads those files, but Compose still disables migration and seed on startup. Automatic import and restart safety remain to be verified.</span>

---

## **Part 2: Core Dashboard Implementation**

Build the main dashboard with basic navigation and a patient list loading data from the backend.

**Tasks:**

1. **Implement patient CRUD endpoints**:
    - `GET /patients` — List patients with pagination
    - `GET /patients/{id}` — Get a specific patient
    - `POST /patients` — Create a patient
    - `PUT /patients/{id}` — Update a patient
    - `DELETE /patients/{id}` — Delete a patient

      <span style="color: red;">All five routes exist and register in OpenAPI. Database-backed acceptance is pending: the running GET /patients returned HTTP 500 during inventory. See <a href="../backend/app/routers/patients.py" style="color: red;">patient routes</a>.</span>
2. **Create a responsive layout** with:
    - Header with navigation
    - Sidebar
    - Main content area

      <span style="color: red;"><a href="../frontend/src/app/AppShell.tsx" style="color: red;">AppShell</a> implements header, collapsible sidebar and mobile navigation. Final responsive checks are pending.</span>
3. **Implement a PatientList component** that displays:
    - Patient cards/rows with: name, age, last visit, status
    - Search/filter functionality
    - Sorting capabilities
    - Pagination or infinite scroll

      <span style="color: red;">API list fields, search/filter/sort/pagination, UI filters and pagination helpers exist. The React list is still being assembled; demo mode currently uses in-memory fixtures rather than PostgreSQL.</span>
4. **Add routing** for:
    - Dashboard home (/)
    - Patient list (/patients)
    - Individual patient view (/patients/:id)
    - 404 page

      <span style="color: red;">All required paths are declared in <a href="../frontend/src/app/router.tsx" style="color: red;">router.tsx</a>. Some page/detail modules were absent at this snapshot; direct-link and 404 acceptance remain open.</span>

**Requirements:**

- List should handle 100+ patients efficiently

  <span style="color: red;">100 cleaned patients are ready. Server-side paging and stable sorting exist; full-dataset performance has not yet been measured.</span>
- Search should be non-blocking

  <span style="color: red;">Search has a 250 ms debounce and query cancellation. Verify typing remains responsive in the finished list.</span>
- The application should be responsive for lower resolution screens

  <span style="color: red;">Mobile navigation and responsive HTML mocks exist. The integrated React screens still need desktop, tablet and phone checks.</span>
- Implement proper input validation and error handling with appropriate HTTP status codes

  <span style="color: red;">Pydantic validation and shared error handling exist; verify errors through the real UI. Unread filtering currently differs: frontend sends has_unread_comments, backend expects unread_only.</span>

---

## **Part 3: Patient Notes**

Add the ability to attach clinical notes to patients.

**Backend Tasks:**

1. **Create endpoints for patient notes**:
    - `POST /patients/{id}/notes` — Add a note (accepts timestamp and text content)
    - `GET /patients/{id}/notes` — List all notes for a patient
    - `DELETE /patients/{id}/notes/{note_id}` — Delete a note

      <span style="color: red;">Required note routes are implemented, including timezone-aware timestamps, authors and separate creation/update times. PostgreSQL-backed add/list/delete verification is pending.</span>
2. **Create a summary endpoint** (`GET /patients/{id}/summary`) that synthesizes a human-readable summary from the patient's profile and notes. The summary should include:
    - Basic patient identifiers (name, age, blood type)
    - A coherent narrative generated from the notes
    - Key clinical information (conditions, allergies)

    *Hint: an LLM can be helpful here, but a simple template-based approach is also acceptable.*

    <span style="color: red;"><a href="../backend/app/services/summaries.py" style="color: red;">Template summaries</a> include the required patient facts and active clinical notes, with no API key. Discussion and deleted notes are excluded. Verify the no-notes case and updates against the running database.</span>


**Frontend Tasks:**

1. **Add a notes section** to the patient detail view:
    - Display existing notes with timestamps
    - Form to add new notes
    - Delete functionality

      <span style="color: red;">HTTP/demo adapters and HTML mocks support notes. The React detail workspace is still being built; real add/delete and count refresh remain unverified.</span>
2. **Add a summary view** that displays the generated patient summary.

   <span style="color: red;">The summary API and frontend adapter exist; the integrated summary view is pending. Discussion is separate: read acknowledgement payloads, per-comment unread state and notification fields still need frontend/backend agreement.</span>

---

## **Part 4: State & Form Management**

Add patient creation/editing with form handling.

**Tasks:**

1. **Build a patient form** with:
    - Personal information (name, DOB, contact, address)
    - Medical information (allergies, conditions, blood type, status)

      <span style="color: red;">Patient-write types and server schemas cover these fields. TanStack Form/Zod are selected; the actual create/edit form was not yet present at the snapshot.</span>
2. **Implement form features**:
    - Client-side and server-side validation
    - Meaningful error messages displayed to the user

      <span style="color: red;">Server validation and client error mapping exist. Align field limits, including phone/state/postal code, and verify messages appear beside the correct controls.</span>
3. **Error handling** for:
    - Network failures
    - Validation errors

      <span style="color: red;">The API adapter handles network failures, cancellation and structured errors. Form retry, recovery and successful save navigation still need integrated tests.</span>

---

## **Part 5: Containerization**

Package everything for easy local development.

**Tasks:**

1. Create a `Dockerfile` for the FastAPI backend.

   <span style="color: red;"><a href="../infra/docker/backend.Dockerfile" style="color: red;">Backend Dockerfile</a> exists with locked dependencies, a nonroot runtime and packaged seed data.</span>
2. Create a `Dockerfile` for the React frontend (or serve via the backend).

   <span style="color: red;"><a href="../infra/docker/frontend.Dockerfile" style="color: red;">Frontend Dockerfile</a> has development, checks and compiled nginx targets. The compiled build was blocked by frontend modules still arriving.</span>
3. Create a `docker-compose.yml` that starts:
    - Backend API
    - PostgreSQL database
    - Frontend

      <span style="color: red;"><a href="../docker-compose.yml" style="color: red;">Compose</a> defines all three services, health checks and persistent PostgreSQL storage. Configuration and live development health checks pass. Default demo mode and disabled migrations/seeding still prevent full application acceptance.</span>
4. Include `.env.example` with required environment variables.

   <span style="color: red;"><a href="../.env.example" style="color: red;">.env.example</a> contains sample settings; .gitignore and .dockerignore exclude local environment files. Final clean-start, API-mode and restart-persistence checks remain open.</span>

---

## **Stretch Goals (Choose Based on Time & Strengths)**

Choose 1-2 individual features from the list below that best demonstrate your expertise and/or interests:

<span style="color: red;">Alembic, filtering, tests, CI, hot reload and virtualization have active work or assignments. Optional features below are not complete merely because they appear in the plan.</span>

### **Performance Optimization**

- Implement virtualization for large patient lists

  <span style="color: red;">TanStack Virtual is installed and assigned; the virtualized React table and keyboard/performance verification are still pending.</span>
- Add code splitting and lazy loading

  <span style="color: red;">Not implemented at this snapshot: routes currently use eager imports.</span>
- Optimize re-renders with memoization

  <span style="color: red;">Some shared context is memoized; no measured patient-list rendering improvement is verified yet.</span>

### **Advanced Backend**

- Add sorting/filtering query parameters to list endpoint

  <span style="color: red;">Implemented in the backend query schemas and SQL service. Real endpoint tests remain to be confirmed.</span>
- Implement request logging middleware

  <span style="color: red;">Not implemented: existing exception-log redaction does not provide request duration or request-ID middleware.</span>
- Add database migrations with Alembic

  <span style="color: red;">The initial migration exists. Clean upgrade, downgrade/upgrade and model agreement checks remain pending.</span>

### **Advanced UI/UX**

- Dark/light theme switching

  <span style="color: red;">Optional and not implemented; the current UI uses the light theme.</span>
- Advanced search with filters

  <span style="color: red;">Basic search/status filtering exists. Blood type, condition, age-range and visit-range filters are not implemented.</span>
- Data visualization (patient status chart)

  <span style="color: red;">Backend dashboard totals exist; no React status chart was present at this snapshot.</span>

### **Testing & Quality**

- Unit tests for API endpoints

  <span style="color: red;">20 focused backend foundation tests passed. CRUD/notes/summary and migration tests exist but still require a migrated disposable PostgreSQL test run; earlier data-fixture test results do not prove this integration.</span>
- Component tests for critical UI

  <span style="color: red;">Vitest/Testing Library tests cover UI primitives, adapters and dates. Critical assembled list/form tests and a full passing run are pending.</span>
- E2E tests for main user journeys

  <span style="color: red;">Playwright configuration exists, but no E2E test directory was present. Verify real API journeys and all <a href="../chatroom/frontend-updates.md" style="color: red;">frontend addition checks</a>, including unread state, notifications and focus restoration.</span>

### **Developer Experience**

- Set up CI/CD pipeline configuration

  <span style="color: red;"><a href="../.github/workflows/ci.yml" style="color: red;">CI configuration</a> exists; hosted results are pending. Wire the backend TEST_DATABASE_URL/migrations and Playwright into checks. The current smoke test disables seeding and checks an empty schema, so it does not yet prove the seeded dashboard.</span>
- Hot reloading in Docker for both frontend and backend

  <span style="color: red;"><a href="../infra/compose.dev.yml" style="color: red;">Development Compose</a> mounts source for Vite and Uvicorn --reload; the development stack is running. Verify frontend and Python edits reload without rebuilding.</span>
