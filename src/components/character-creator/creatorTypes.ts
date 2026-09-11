import type React from 'react';
import {
  BookOpen,
  Crown,
  MapPin,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';

export type CreatorPanel = 'identity' | 'house' | 'background' | 'relations' | 'traits' | 'situation';

export const CREATOR_PANELS: Array<{
  id: CreatorPanel;
  label: string;
  note: string;
  icon: React.ElementType;
}> = [
  { id: 'identity', label: '人物', note: '身份与年龄', icon: UserRound },
  { id: 'house', label: '家族', note: '宗族与纹章', icon: Crown },
  { id: 'background', label: '身世', note: '出身与生计', icon: BookOpen },
  { id: 'relations', label: '关系', note: '熟人与血缘', icon: Users },
  { id: 'traits', label: '特质', note: '性格与本事', icon: Sparkles },
  { id: 'situation', label: '开局', note: '处境与地点', icon: MapPin },
];
