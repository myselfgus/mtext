import { IndexedEntity } from "./core-utils";
import type { TranscriptionResult } from "@shared/types";
/**
 * TranscriptionEntity handles the persistence of clinical audio analysis.
 * Replaces template ChatBoardEntity and UserEntity.
 */
export class TranscriptionEntity extends IndexedEntity<TranscriptionResult> {
  static readonly entityName = "transcription";
  static readonly indexName = "transcriptions";
  static readonly initialState: TranscriptionResult = {
    id: "",
    url: "",
    text: "",
    language_code: "pt",
    segmented_json: null,
    txt_content: "",
    timestamp: 0,
  };
  static seedData: TranscriptionResult[] = [];
}