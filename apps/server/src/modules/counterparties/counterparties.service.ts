import { COUNTERPARTY_SUGGESTIONS_LIMIT, type Counterparty } from '@label-stock/shared';
import type { CounterpartyRow } from '../../db/schema';
import { duplicate, notFound, uniqueViolationConstraint } from '../../shared/errors';
import type { CounterpartiesRepository } from './counterparties.repository';

export function toCounterpartyDto(row: CounterpartyRow): Counterparty {
  return {
    id: row.id,
    name: row.name,
    externalId: row.externalId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class CounterpartiesService {
  constructor(private readonly repository: CounterpartiesRepository) {}

  async search(search: string | undefined): Promise<Counterparty[]> {
    const rows = await this.repository.search(search, COUNTERPARTY_SUGGESTIONS_LIMIT);
    return rows.map(toCounterpartyDto);
  }

  /** Идемпотентно: если контрагент с таким именем уже есть (без учёта регистра и пробелов), возвращает его. */
  async create(name: string): Promise<{ counterparty: Counterparty; created: boolean }> {
    const inserted = await this.repository.insertIfAbsent(name);
    if (inserted) return { counterparty: toCounterpartyDto(inserted), created: true };

    const existing = await this.repository.findByName(name);
    if (!existing) throw new Error('Контрагент не создан и не найден после конфликта уникальности');
    return { counterparty: toCounterpartyDto(existing), created: false };
  }

  async rename(id: string, name: string): Promise<Counterparty> {
    let row: CounterpartyRow | undefined;
    try {
      row = await this.repository.rename(id, name);
    } catch (error) {
      if (!uniqueViolationConstraint(error)) throw error;
      const existing = await this.repository.findByName(name);
      throw duplicate('Контрагент с таким названием уже есть', {
        field: 'name',
        conflictingId: existing?.id ?? '',
      });
    }
    if (!row) throw notFound('Контрагент не найден');
    return toCounterpartyDto(row);
  }
}
