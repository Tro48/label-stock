import type { CreateStockRequestInput, StockRequestResult } from '@label-stock/shared';
import { apiRequest } from '../../shared/api/client';
import { useLabelMutation } from '../labels/api';

export function useCreateStockRequest() {
  return useLabelMutation((input: CreateStockRequestInput) =>
    apiRequest<StockRequestResult>('/stock-requests', { method: 'POST', body: input }),
  );
}
