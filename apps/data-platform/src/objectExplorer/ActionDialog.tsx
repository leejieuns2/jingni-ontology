// Generates an action's form from its JSON Schema, so a new action needs no UI
// work — only a `parameter_schema` and a server-side handler.
import {
  Button,
  Callout,
  Dialog,
  DialogBody,
  DialogFooter,
  FormGroup,
  HTMLSelect,
  InputGroup,
  NumericInput,
} from "@blueprintjs/core";
import { DateInput } from "@blueprintjs/datetime";
import { useState } from "react";
import { invokeAction, type ActionMeta, type ActionResult, type JsonSchema } from "../api.ts";

type Props = {
  action: ActionMeta;
  type: string;
  id: string;
  onClose: () => void;
  /** Refreshes the detail view behind the dialog after a successful write. */
  onCompleted: () => void | Promise<void>;
};

type FieldKind = "datetime" | "enum" | "number" | "string";

type Field = {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  description: string | null;
  options: string[];
};

export function ActionDialog({ action, type, id, onClose, onCompleted }: Props) {
  const fields = fieldsOf(action.parameter_schema);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const missing = fields.filter((field) => field.required && isEmpty(values[field.name]));

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const params = buildParams(fields, values);
      setResult(await invokeAction(type, id, action.api_name, params));
      await onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={action.name}
      icon="lightning"
      className="action-dialog"
    >
      <DialogBody>
        {action.description && <p className="muted">{action.description}</p>}

        {result ? (
          <Callout intent="success" title="Action applied">
            <p>
              {action.name} on <code>{result.id}</code> succeeded. The object below has been
              refreshed.
            </p>
            <pre className="action-dialog__result">
              {JSON.stringify(result.properties, null, 2)}
            </pre>
          </Callout>
        ) : (
          <>
            {fields.length === 0 && (
              <p className="muted">This action takes no parameters.</p>
            )}

            {fields.map((field) => (
              <FormGroup
                key={field.name}
                label={field.label}
                labelFor={field.name}
                labelInfo={field.required ? "(required)" : undefined}
                helperText={field.description ?? undefined}
              >
                <FieldInput
                  field={field}
                  value={values[field.name]}
                  onChange={(value) =>
                    setValues((current) => ({ ...current, [field.name]: value }))
                  }
                />
              </FormGroup>
            ))}

            {error && (
              <Callout intent="danger" title="Action failed">
                {error}
              </Callout>
            )}
          </>
        )}
      </DialogBody>

      <DialogFooter
        actions={
          result ? (
            <Button intent="primary" text="Close" onClick={onClose} />
          ) : (
            <>
              <Button text="Cancel" onClick={onClose} disabled={submitting} />
              <Button
                intent="primary"
                text="Apply"
                loading={submitting}
                disabled={missing.length > 0}
                onClick={() => void submit()}
              />
            </>
          )
        }
      />
    </Dialog>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.kind) {
    case "datetime":
      return (
        <DateInput
          value={typeof value === "string" ? value : null}
          onChange={(date) => onChange(date)}
          // Explicit format so typed input parses the same way it is displayed.
          dateFnsFormat="yyyy-MM-dd HH:mm"
          timePrecision="minute"
          placeholder="yyyy-mm-dd hh:mm"
          showActionsBar
          fill
        />
      );
    case "enum":
      return (
        <HTMLSelect
          id={field.name}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.currentTarget.value)}
          fill
        >
          <option value="">Select…</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </HTMLSelect>
      );
    case "number":
      return (
        <NumericInput
          id={field.name}
          value={typeof value === "number" ? value : ""}
          onValueChange={(numeric) => onChange(Number.isNaN(numeric) ? undefined : numeric)}
          fill
        />
      );
    default:
      return (
        <InputGroup
          id={field.name}
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
        />
      );
  }
}

/** Maps the schema's properties onto the four input kinds the form supports. */
function fieldsOf(schema: JsonSchema | null): Field[] {
  if (!schema?.properties) return [];
  const required = new Set(schema.required ?? []);

  return Object.entries(schema.properties).map(([name, property]) => ({
    name,
    label: property.title ?? humanize(name),
    kind: kindOf(property),
    required: required.has(name),
    description: property.description ?? null,
    options: (property.enum ?? []).map(String),
  }));
}

/** `newPlannedStart` → `New planned start`, for schemas without a `title`. */
function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function kindOf(property: JsonSchema): FieldKind {
  if (property.enum) return "enum";
  if (property.type === "number" || property.type === "integer") return "number";
  if (property.format === "date-time" || property.format === "date") return "datetime";
  return "string";
}

/**
 * Shapes the form state into the request body the action handler expects: empty
 * optionals are dropped, and datetimes are normalised to UTC ISO strings so they
 * satisfy the schema's `format: date-time` and parse the same way server-side.
 */
function buildParams(fields: Field[], values: Record<string, unknown>): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const field of fields) {
    const value = values[field.name];
    if (isEmpty(value)) continue;

    if (field.kind === "datetime" && typeof value === "string") {
      const date = new Date(value);
      params[field.name] = Number.isNaN(date.getTime()) ? value : date.toISOString();
    } else {
      params[field.name] = value;
    }
  }

  return params;
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}
