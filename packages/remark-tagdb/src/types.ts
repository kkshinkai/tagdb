import type {Content, Literal} from "mdast";
import type {Point} from "unist";

export interface RemarkTagdbOptions {
  tags?: ReadonlyArray<string> | ReadonlySet<string>;
  properties?: PropertyDefinitions;
}

export type PropertyDefinitions =
  | ReadonlyArray<string>
  | ReadonlySet<string>
  | Readonly<Record<string, TagdbPropertyDefinition>>;

export interface TagdbPropertyDefinition {
  valueKind?: TagdbPropertyValueKind;
}

export interface TagdbData {
  attachments?: TagdbAttachment[];
}

export interface TagdbTagNode extends Literal {
  type: "tagdbTag";
  value: string;
  data?: {
    tagdb?: {
      origin?: TagdbSourceRange;
    };
  };
}

export interface TagdbPropertyNode extends Literal {
  type: "tagdbProperty";
  value: string;
  data?: {
    tagdb?: {
      name?: string;
      origin?: TagdbSourceRange;
      raw?: string;
      value?: JsonValue;
      valueKind?: TagdbPropertyValueKind;
    };
  };
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {[key: string]: JsonValue};

export type TagdbAttachment = TagdbTagAttachment | TagdbPropertyAttachment;
export type TagdbPropertyValueKind = "scalar" | "object" | "array" | "markdown";

export interface TagdbTagAttachment {
  kind: "tag";
  name: string;
  placement?: TagdbAttachmentPlacement;
  origin?: TagdbSourceRange;
  target?: TagdbSourceRange;
}

export interface TagdbPropertyAttachment {
  kind: "property";
  name: string;
  placement?: TagdbAttachmentPlacement;
  valueKind: TagdbPropertyValueKind;
  raw: string;
  value: JsonValue | string;
  children?: Content[];
  origin?: TagdbSourceRange;
  target?: TagdbSourceRange;
}

export type TagdbAttachmentPlacement = "inline" | "block" | "root";

export interface TagdbSourceRange {
  start: Point;
  end: Point;
}
