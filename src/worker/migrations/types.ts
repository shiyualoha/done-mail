export interface MigrationDefinition {
  name: string;
  statements: string[];
}

export interface Migration extends MigrationDefinition {
  version: number;
}
