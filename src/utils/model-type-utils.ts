import { DffModelType } from 'rw-parser';
import { ModelType } from '../constants/model-types';

export function mapRwModelType(rwModelType: DffModelType): ModelType {
  switch (rwModelType) {
    case DffModelType.SKIN:
      return ModelType.SKIN;
    default:
      return ModelType.OBJECT;
  }
}