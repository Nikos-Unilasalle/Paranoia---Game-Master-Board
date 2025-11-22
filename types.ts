
// Game State Models
export interface GameClock {
  id: string;
  name: string;
  current: number;
  max: number;
}

export interface GameState {
  run_id: string;
  etape_active: string | null;
  horloges: GameClock[];
  indices_vus: string[];
  objets_en_jeu: { id: string; statut: string }[];
  pnj_state: { id: string; attitude: string }[];
  dernières_actions: { qui: string; action: string; résumé: string }[];
  last_options: string[]; // To track the last generated options for number selection
  // Cache for overlays
  cache_indices: OmniResponse | null;
  cache_personnages: OmniResponse | null;
}

// Markdown Content
export interface ScenarioFile {
  name: string;
  content: string;
}

// API Response Schemas
export type ResponseType = 
  | 'GM_BRIEF' 
  | 'PLAYER_FACING' 
  | 'OPTIONS' 
  | 'CONSEQUENCES' 
  | 'COMPUTER_MESSAGE' 
  | 'CLUE_DROPS' 
  | 'RAIL_BRIDGES'
  | 'TURN_RESULT'
  | 'CHARACTERS_LIST';

export interface BaseResponse {
  type: ResponseType;
  sources: string[];
  timestamp?: number; // For history ordering
}

export interface GmBriefResponse extends BaseResponse {
  type: 'GM_BRIEF';
  scene: string;
  bullets: string[];
}

export interface PlayerFacingResponse extends BaseResponse {
  type: 'PLAYER_FACING';
  title: string;
  bullets: string[];
}

export interface OptionsResponse extends BaseResponse {
  type: 'OPTIONS';
  prompt: string;
  choices: string[];
}

export interface ConsequencesResponse extends BaseResponse {
  type: 'CONSEQUENCES';
  trigger: string;
  bullets: string[];
}

export interface ComputerMessageResponse extends BaseResponse {
  type: 'COMPUTER_MESSAGE';
  bullets: string[];
}

export interface ClueDropsResponse extends BaseResponse {
  type: 'CLUE_DROPS';
  bullets: string[];
}

export interface RailBridgesResponse extends BaseResponse {
  type: 'RAIL_BRIDGES';
  from: string;
  to: string;
  bridges: string[];
}

export interface CharactersListResponse extends BaseResponse {
    type: 'CHARACTERS_LIST';
    characters: { name: string; role: string; trait: string }[];
}

// New Combined Response for the Game Loop
export interface TurnResultResponse extends BaseResponse {
  type: 'TURN_RESULT';
  trigger: string;
  consequences: string[];
  new_options: string[];
}

export type OmniResponse = 
  | GmBriefResponse 
  | PlayerFacingResponse 
  | OptionsResponse 
  | ConsequencesResponse 
  | ComputerMessageResponse 
  | ClueDropsResponse 
  | RailBridgesResponse
  | TurnResultResponse
  | CharactersListResponse;
