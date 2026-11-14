---
name: pace
description: 학습자가 속도와 난도에 대한 느낌을 알려 준다.
argument-hint: "[너무 빠름 | 너무 느림 | 지루함 | 어려움]"
disable-model-invocation: true
---

학습자가 보낸 페이스 신호: $ARGUMENTS

이 신호를 관찰한 신호보다 우선한다. 「너무 빠름」은 `too_fast`, 「어려움」은 `stuck`, 「너무 느림」과 「지루함」은 `bored_or_ready`로 본다. 몰입과 페이스 규칙의 해당 상태 대응을 바로 적용하고, `learner/state.json`의 `pace`를 고친다. 비어 있으면 무엇이 불편한지 하나만 묻는다. 어떻게 바꾸는지 한 문장으로 말하고 곧장 다음 활동으로 이어간다.
