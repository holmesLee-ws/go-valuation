---
name: check
description: 모듈이나 영역의 성숙도를 빠르게 확인하고, 아는 부분은 건너뛴다.
argument-hint: "[모듈 id 또는 영역 F·M·R·P]"
disable-model-invocation: true
---

성숙도 판정 규칙대로 빠른 확인을 한다. 대상: $ARGUMENTS

대상이 없으면 `learner/state.json`에서 다음 모듈을 대상으로 삼는다. 영역이면 「영역 빠른 확인」 절차를 따른다. 설명하지 말고 탐침을 하나씩 낸다. 끝나면 무엇을 건너뛰고 어디부터 할지 한 문장으로 말하고 기록한다.

`learner/state.json`이 없으면 이 명령을 하지 않고 세션 흐름의 첫 세션부터 시작한다.
