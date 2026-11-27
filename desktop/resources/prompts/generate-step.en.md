{phase_prompt}

## Current step: {step_name}

{instructions}

## Documents of this step

Write each document into its own folder: one or more .md files, as the instructions above decide. Where a template is listed, follow its structure.

{artifacts}

## Existing files

Update these instead of rewriting them from scratch, and keep what the user has edited:

{existing}

## Sources (sources/)

Read the sources you need. Never edit them:

{sources}

## Results of earlier steps

Use them as input. Do not change them:

{previous}

## Rules

- Write files only under artifacts/initial/<the document's folder>/. Never change sources, .procheck or any other file.
- Write Markdown in English. Leave out the guidance comments (<!-- ... -->) of the templates.
- Finish with a short summary: which files you wrote or updated, and what is still missing.
