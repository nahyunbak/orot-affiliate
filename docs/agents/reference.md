# 프로젝트 상세 레퍼런스

루트 [AGENTS.md](../../AGENTS.md)의 공통 계약을 따른다. 이 문서는 해당 기능을 작업할 때 필요한 절만 확인한다. 경로는 저장소 루트 기준이며 명령은 지정한 디렉터리에서 실행한다.

## 터미널과 완료 알림

작업 시작 시 실행한다.

```bash
TASK_LABEL="$(date '+%H:%M') 작업 요약"
printf '\033]0;%s\007' "$TASK_LABEL"
printf '%s\n' "$TASK_LABEL" > /tmp/codex-task-label.txt
```

완료 시 아래 순서로 실행한다. 병렬 작업으로 공용 임시 파일이 바뀌었으면 이번 작업의 라벨을 사용한다.

```bash
TASK_LABEL="$(cat /tmp/codex-task-label.txt 2>/dev/null || date '+%H:%M 작업 완료')"
printf '\a'
osascript - "$TASK_LABEL" <<'APPLESCRIPT'
on run argv
  display notification (item 1 of argv) with title "Codex" sound name "Glass"
end run
APPLESCRIPT
```

알림 도구가 없는 환경이면 제한을 보고하고, 최종 응답에는 `🔔 **작업이 완료되었습니다!** (bip!)`를 포함한다.
