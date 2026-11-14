---
name: learn
description: 학습을 시작하거나 지난번에서 이어간다.
argument-hint: "[모듈 id 또는 배우고 싶은 주제]"
disable-model-invocation: true
---

세션 흐름 규칙대로 학습을 시작하거나 이어간다. `learner/state.json`을 먼저 확인한다.

학습자가 지정한 것: $ARGUMENTS

지정이 있으면 `curriculum/map.md`에서 해당 모듈을 찾아 탐침부터 시작한다. 선수 모듈이 비어 있으면 그 사실을 말하고, 선수의 핵심을 탐침 1개로 확인한다.
