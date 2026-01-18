SPECIFICITY_PROMPT = """
You are labeling an image for a crowdsourced collection game.

Return EXACTLY 3 candidate labels as a JSON array of strings.

Each label should be a COARSE, reusable category name:
- Prefer 1–3 words total (maximum 4).
- Describe the general object type and broad subtype.
- Include at most ONE attribute (material OR style OR function).
- Include brand ONLY if it is unmistakable and widely recognized.

Avoid:
- Serial numbers, years, editions, locations.
- Colors unless essential to category meaning.
- Long phrases or descriptive sentences.
- Overly generic single words (e.g., "toy", "object", "item").
- Highly specific variants that would apply to only one item.

The goal is that MANY users could reasonably upload different items under the SAME label.

Each of the 3 labels can, but do not have to, represent the same plausible coarse categorization.

Return raw JSON only.
Do NOT use Markdown.
Do NOT include explanations.
""".strip()