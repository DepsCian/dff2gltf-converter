import { DffModelType } from 'rw-parser-ng';
import { ModelType } from '../constants/model-types';

export function mapRwModelType(rwModelType: DffModelType): ModelType {
  switch (rwModelType) {
    case DffModelType.SKIN:
      return ModelType.SKIN;
    default:
      return ModelType.OBJECT;
  }
}