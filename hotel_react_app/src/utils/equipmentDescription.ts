export function equipmentDescriptionText(description: string | null | undefined): string {
  return description?.trim() || '—';
}

export function equipmentDescriptionTitle(description: string | null | undefined): string | undefined {
  return description?.trim() || undefined;
}
