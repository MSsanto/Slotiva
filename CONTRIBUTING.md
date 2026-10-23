# Contributing

Use a branch and a pull request for changes. Describe the problem, the result
and how it was checked.

Run the checks relevant to the change. Update the API contract when routes change,
setup instructions when configuration changes, and the changelog for user-facing
changes. Documentation is in English; application text is in Portuguese.

Keep secrets, databases and customer data out of commits. Use fictional data
in tests and screenshots. Add a new migration instead of editing an applied one.
Deployment and remote migrations need a separate release step.

The documentation workflow checks local Markdown links. It does not require
unrelated documentation edits for code or test changes.
