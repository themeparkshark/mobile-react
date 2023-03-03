import { ApiResponseType } from '../../../models/api-response-type';
import { InformationModalType } from '../../../models/information-modal-type';
import client from '../../client';

export default async function getInformationModal(
  id: number
): Promise<InformationModalType> {
  const { data } = await client.get<ApiResponseType<InformationModalType>>(
    `/information-modals/${id}`
  );

  return data.data;
}
