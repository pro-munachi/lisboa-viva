/** Only the latest explicit location choice may open its arrival panel. */
export class LocationSelectionGate {
  private revision = 0;
  private pending: string | null = null;

  begin(): string {
    this.pending = `location-${++this.revision}`;
    return this.pending;
  }

  complete(id: string): boolean {
    if (this.pending !== id) return false;
    this.pending = null;
    return true;
  }

  cancel(): void {
    this.pending = null;
  }
}
