import client from '../../client';
import { ApiResponseType } from '../../../models/api-response-type';
import { CatalogType } from '../../../models/catalog-type';

export default async function get(catalog: number): Promise<CatalogType> {
  const response = await client.get<ApiResponseType<CatalogType>>(
    `/catalogs/${catalog}`
  );

  return response.data.data;
}
