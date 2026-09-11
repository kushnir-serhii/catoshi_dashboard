# Functional Specification: Accounts, Roles and a Per-Person Reforecast Allowance

- **Roadmap Item:** Not on the current roadmap. This specification deliberately reverses
  the 02.09.2026 decision that removed user accounts (`product-definition.md` §3.2).
- **Status:** Draft
- **Author:** Serhii Kushnir

---

## 1. Overview and Rationale (The "Why")

### The problem today

Producing a fresh forecast costs real money on every press of the Reforecast button.
Today the only thing standing between the button and the bill is a single shared
operator credential: whoever holds it can reforecast, and everyone else cannot use the
feature at all. That leaves the product with two bad options and no third one. Keep the
credential secret and the most interesting thing in the product is invisible to every
visitor. Share it and a single leaked value hands unlimited spending to anyone who has it.

There is also no way to tell one person from another. The daily generation ceiling counts
presses across the whole product, so one enthusiastic visitor can exhaust the day for
everybody, and nobody can be told why.

### What changes

People can sign in with their Google account. Once signed in, each person gets their own
allowance of **three successful forecasts per day**, which is theirs alone and cannot be
consumed by anyone else. Visitors who do not sign in keep the product exactly as it is
today — every price, signal, projection, model score and chart stays open to them — but
pressing Reforecast invites them to sign in rather than producing a forecast.

Three kinds of person exist: a **guest** who has not signed in, a **user** who has, and an
**admin** who runs the product. The shared operator credential goes away, and the
operator controls it protected move behind the admin role instead.

### Desired outcome

The most valuable action in the product becomes available to anyone willing to sign in,
while the cost of that action stays predictable and attributable to a named person.

### How we measure success

- A visitor can reach a fresh forecast by signing in, with no credential shared by hand.
- Every forecast produced by a press of the button can be attributed to one signed-in person.
- No signed-in person can produce a fourth forecast in a single day.
- No surface ever refuses the button without saying why.

### A consequence being accepted deliberately

The product-wide daily forecast ceiling is being **removed**, so total daily cost now
scales with the number of people who sign in — three forecasts each, with no outer limit.
Google sign-in makes it awkward to register many accounts, but not impossible. This is
recorded here as a known and accepted risk while the product has no meaningful audience,
to be revisited if daily cost becomes noticeable.

---

## 2. Functional Requirements (The "What")

### 2.1 Signing in with Google

- **As a** visitor, **I want to** sign in with my Google account, **so that** I can use the
  Reforecast button without creating or remembering another password.
  - **Acceptance Criteria:**
    - [ ] A "Sign in" control is visible on every dashboard screen while I am not signed in.
    - [ ] Pressing it offers exactly one way in: continue with Google. There is no email
          field, no password field, and no "create account" form anywhere in the product.
    - [ ] Completing the Google flow returns me to the screen I was on, now signed in.
    - [ ] The first time I sign in, my account is created for me. I am never shown a
          separate registration step.
    - [ ] If I abandon or cancel the Google flow, I return to the screen I was on, still a
          guest, and nothing tells me anything went wrong.
    - [ ] If the sign-in cannot be completed for a real reason, I see a short message saying
          sign-in did not work and inviting me to try again.

- **As a** signed-in person, **I want to** see that I am signed in and be able to sign out,
  **so that** I stay in control of my session on a shared machine.
  - **Acceptance Criteria:**
    - [ ] While signed in, an account menu shows my name and the email address of the
          Google account I used.
    - [ ] The account menu contains a "Sign out" action.
    - [ ] After signing out I am a guest again, and the Reforecast button reverts to
          inviting me to sign in.
    - [ ] Closing the browser and returning later leaves me still signed in. I am not asked
          to sign in again on every visit.

### 2.2 Three kinds of person

- The product recognises exactly three kinds of person, and nothing else.
  - **Acceptance Criteria:**
    - [ ] **Guest** — has not signed in. Can read every screen the product has today:
          prices, signals, projections, models, charts, watchlist. Cannot produce a forecast.
    - [ ] **User** — has signed in. Can do everything a guest can, plus produce up to three
          forecasts per day.
    - [ ] **Admin** — can do everything a user can, with no daily forecast limit, plus reach
          the administration screens described in §2.5.
    - [ ] Everyone who signs in for the first time becomes a **user**. Nobody becomes an
          admin by signing in.
    - [ ] The very first admin is granted directly by the operator, once, outside the
          product. From then on an admin promotes anyone else from the roles screen.

### 2.3 The Reforecast button for a guest

- **As a** guest, **I want to** understand why I cannot reforecast and what to do about it,
  **so that** I am not left staring at a control that does nothing.
  - **Acceptance Criteria:**
    - [ ] The Reforecast button is visible to me, not hidden and not greyed out without
          explanation.
    - [ ] Pressing it does not produce a forecast and does not change the chart.
    - [ ] Pressing it shows me the sign-in invitation, worded so I understand that signing
          in is what unlocks the feature.
    - [ ] After signing in from that invitation, I am returned to the same screen and the
          button is now usable. My press is not silently carried out for me — I press it
          again deliberately.

### 2.4 The three-per-day allowance

- **As a** signed-in person, **I want to** know how many forecasts I have left today,
  **so that** I can decide when to spend one.
  - **Acceptance Criteria:**
    - [ ] The Reforecast button states how many I have left today, for example
          "Reforecast — 2 left today".
    - [ ] The account menu repeats the same number alongside the time the allowance comes
          back.
    - [ ] The number shown is mine alone. Another person using the product at the same time
          never changes it.

- **As a** signed-in person, **I want** my allowance enforced honestly, **so that** the
  product never charges me for something it did not do, and never claims success it did
  not achieve.
  - **Acceptance Criteria:**
    - [ ] My first three presses in a day each produce a fresh forecast, and the chart
          visibly redraws from it.
    - [ ] The count shown on the button goes down by exactly one per forecast actually
          produced.
    - [ ] A press that fails to produce a forecast shows me an error and leaves my count
          unchanged. Only forecasts I actually received are counted against me.
    - [ ] On my fourth press in a day, no forecast is produced, and I see a message saying
          I have used all three for today and naming the time they come back.
    - [ ] The allowance resets for everyone at midnight UTC. At 00:00 UTC my count returns
          to three regardless of when I used them.
    - [ ] The reset time is always stated in the message, never left for me to guess.
    - [ ] Signing out and back in does not restore my allowance.

- **As an** admin, **I want** no daily limit on my own forecasts, **so that** I can
  investigate and test the forecasting path.
  - **Acceptance Criteria:**
    - [ ] As an admin I can press Reforecast more than three times in one day, and each
          press produces a forecast.
    - [ ] My button does not display a remaining count, because I do not have one.

### 2.5 Administration

- **As an** admin, **I want to** see who has signed in and change what they can do,
  **so that** I can grant and remove access without touching anything outside the product.
  - **Acceptance Criteria:**
    - [ ] An administration area is reachable only by an admin. A user who reaches its
          address directly is told they do not have access and is sent back to the dashboard.
          A guest is invited to sign in.
    - [ ] The area lists everyone who has ever signed in, showing each person's name, email
          address, what they can do, when they first signed in, and how many forecasts they
          have used today.
    - [ ] I can change any person between user and admin, and the change is reflected in
          the list immediately.
    - [ ] I cannot remove my own admin access, so the product can never be left with no
          admin. Attempting it explains why it is refused.
    - [ ] I can restore any person's allowance for the current day, so their count returns
          to three before midnight UTC. The list shows the restored count immediately.

- **As an** admin, **I want** the existing operator controls to live behind my account,
  **so that** the shared credential can be retired.
  - **Acceptance Criteria:**
    - [ ] The pause switch for background news classification is reachable by an admin
          while signed in, and by nobody else.
    - [ ] The operator health and freshness views are reachable by an admin while signed
          in, and by nobody else.
    - [ ] The shared operator credential no longer grants access to anything. A person
          holding it and not signed in as an admin can do exactly what any guest can do.

### 2.6 Nothing else changes

- **Acceptance Criteria:**
  - [ ] Every screen a guest can read today shows the same content it shows today. Signing
        in adds the ability to reforecast and nothing else.
  - [ ] The stored forecast continues to be served to everyone, guests included, until its
        freshness window elapses. Reading a forecast never requires signing in.
  - [ ] The device-local watchlist keeps working for a guest exactly as it does today.
  - [ ] A person is never asked to sign in to read anything.

### 2.7 Open questions

- [NEEDS CLARIFICATION: When an admin changes what someone can do while that person is
  using the product, should the change take effect immediately on their screen, or the
  next time they load a page?]
- [NEEDS CLARIFICATION: What should the exact wording of the sign-in invitation on the
  Reforecast button be?]
- [NEEDS CLARIFICATION: Should the administration area be reachable from the main
  navigation for an admin, or only by address?]

---

## 3. Scope and Boundaries

### In-Scope

- Signing in and out with a Google account, with the account created on first sign-in.
- The three kinds of person — guest, user, admin — and what each can do.
- A per-person allowance of three successfully produced forecasts per day, resetting at
  midnight UTC.
- The Reforecast button stating the remaining count, and refusing with a stated reason.
- An administration area listing everyone, changing what they can do, and restoring
  someone's daily allowance.
- Moving the existing operator controls from the shared credential to the admin role.
- Removing the product-wide daily forecast ceiling.

### Out-of-Scope

- **Email and password sign-in, and any other sign-in provider.** Google is the only way in.
- **Email verification, password reset, and any email the product sends.** The product
  sends no email at all.
- **Suspending or deleting a person's account.**
- **A product-wide spending limit above the per-person allowance.** Removed by decision
  here, and the resulting exposure is accepted in §1.
- **Paid plans, larger allowances for money, or any billing.** Everyone who signs in gets
  the same three per day.
- **A profile or settings screen.** A person's name and email come from Google and cannot
  be edited in the product.
- **Saving anything per person beyond what is needed to identify them and count their
  forecasts.** The watchlist stays on the device it was set up on.
- **Changing how forecasts are produced, scored or displayed.**

### Out-of-Scope because it belongs to another roadmap item

- Proving the hourly collection pipeline runs, and the database dump and restore drill.
- News prompt calibration and its cost verification.
- Scoring the news classifier, and making signal thresholds measurable.
- The market history backfill run.
- Historical analogs and the falsification test that gates them.
- The real-time streaming chart ticker.

---

## 4. Documents This Specification Contradicts

Approving this specification requires the following to be updated, or the product's own
documents will contradict it:

- `context/product/product-definition.md` §3.2 — "No user accounts, no sign-up, no login,
  no email capture, no per-user storage on the server. The product is anonymous and
  read-only."
- `context/product/product-definition.md` §3.3 — the boundary test: "If a proposed feature
  needs to know who the user is, it is out of scope."
- `context/product/roadmap.md` — "Explicitly Not On This Roadmap" lists user accounts as
  removed by decision, not deferred.
- `context/spec/019-forecast-cost-control/functional-spec.md` §3 — "User accounts,
  sessions or roles. The operator unlock is one shared secret." The daily generation
  ceiling and shared credential from that specification are superseded here.
