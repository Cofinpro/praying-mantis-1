import type { Level } from '../api/trainings'
import { levelLabel } from '../trainings/levels'
import styles from './LevelTag.module.css'

// Figma "LevelTag": a grey pill with the level's name.
export function LevelTag({ level }: { level: Level }) {
  return <span className={styles.tag}>{levelLabel(level)}</span>
}
