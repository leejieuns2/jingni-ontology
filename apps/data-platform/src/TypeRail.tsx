// The type list shared by both apps: display name plus instance count. What a
// click means is the caller's business (select vs. navigate).
import { Menu, MenuItem, Spinner, Tag } from "@blueprintjs/core";
import type { ObjectTypeMeta } from "./api.ts";

type Props = {
  types: ObjectTypeMeta[];
  selectedApiName: string | null;
  onSelect: (apiName: string) => void;
};

export function TypeRail({ types, selectedApiName, onSelect }: Props) {
  return (
    <aside className="type-rail">
      <div className="type-rail__header">
        <span className="type-rail__title">Object types</span>
        <Tag minimal round>
          {types.length}
        </Tag>
      </div>

      {types.length === 0 ? (
        <div className="type-rail__empty">
          <Spinner size={20} />
        </div>
      ) : (
        <Menu className="type-rail__menu">
          {types.map((type) => (
            <MenuItem
              key={type.api_name}
              text={type.name}
              icon="cube"
              selected={type.api_name === selectedApiName}
              onClick={() => onSelect(type.api_name)}
              labelElement={
                <Tag minimal round>
                  {type.instanceCount ?? "?"}
                </Tag>
              }
            />
          ))}
        </Menu>
      )}
    </aside>
  );
}
