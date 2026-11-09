import { asc, eq, ilike, sql } from 'drizzle-orm';
import { counterparties, type CounterpartyRow } from '../../db/schema';
import type { DbExecutor } from '../../db/client';
import { escapeLikePattern } from '../../shared/like';

const normalizedName = (name: string) => sql`lower(trim(${name}))`;

export class CounterpartiesRepository {
  constructor(private readonly db: DbExecutor) {}

  search(search: string | undefined, limit: number): Promise<CounterpartyRow[]> {
    return this.db
      .select()
      .from(counterparties)
      .where(search ? ilike(counterparties.name, `%${escapeLikePattern(search)}%`) : undefined)
      .orderBy(asc(counterparties.name))
      .limit(limit);
  }

  async findById(id: string): Promise<CounterpartyRow | undefined> {
    const [row] = await this.db.select().from(counterparties).where(eq(counterparties.id, id));
    return row;
  }

  async findByName(name: string): Promise<CounterpartyRow | undefined> {
    const [row] = await this.db
      .select()
      .from(counterparties)
      .where(sql`lower(trim(${counterparties.name})) = ${normalizedName(name)}`);
    return row;
  }

  /** Возвращает созданную строку или undefined, если такое имя уже есть. */
  async insertIfAbsent(name: string): Promise<CounterpartyRow | undefined> {
    const [row] = await this.db
      .insert(counterparties)
      .values({ name })
      .onConflictDoNothing()
      .returning();
    return row;
  }

  async rename(id: string, name: string): Promise<CounterpartyRow | undefined> {
    const [row] = await this.db
      .update(counterparties)
      .set({ name, updatedAt: sql`now()` })
      .where(eq(counterparties.id, id))
      .returning();
    return row;
  }
}
