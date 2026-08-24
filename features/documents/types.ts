export interface DocumentRecord {
  id: string;
  name: string;
  type: string;
  date: string;
  facility: string;
  extracted: string[];
  linked: string[];
  processing?: boolean;
}
