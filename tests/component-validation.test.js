import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Geometry } from "../prototype/geometry.js";

const fixtures = JSON.parse(
  readFileSync("tests/fixtures/component-validation.json", "utf8"),
);
for (const example of fixtures.cases) {
  test(`portable authored component validation: ${example.name}`, () => {
    const model = structuredClone(fixtures.model);
    Object.assign(model.components[0], example.instance);
    Object.assign(
      model.componentDefinitions["machinery@1"],
      example.definition,
    );
    for (const key of example.omitDefinition ?? [])
      // eslint-disable-next-line security/detect-object-injection -- Fixed keys from local authored-validation fixtures.
      delete model.componentDefinitions["machinery@1"][key];
    if (example.valid) assert.doesNotThrow(() => Geometry.validate(model));
    else assert.throws(() => Geometry.validate(model), /component/i);
  });
}
