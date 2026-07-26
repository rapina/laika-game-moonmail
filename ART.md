# Game Art & Audio Provenance

- 날짜: 2026-07-27
- 게임: `moonmail`

게임에 사용한 이미지, 모델, 셰이더, 절차 텍스처와 사운드의 원본, 도구, 프롬프트, 합성·후가공 방식, 해시, 사용 위치를 기록한다.

## 게임 아트

- 시각 매체: 직접 제작한 16비트 계열 PNG 래스터 도트 아트
- 원본: `scripts/generate-pixel-art.mjs`의 픽셀 좌표·팔레트 원본
- 생성·제작 방식: Node 버퍼에 낮은 해상도 PPM 픽셀을 직접 그리고 macOS
  `sips`로 무손실 PNG 변환. 외부 생성 모델과 제3자 이미지 자산은 사용하지
  않았다.
- 원본 캔버스: 플레이필드 `256×448`, 타이틀 키 이미지 `256×448`
- 스프라이트: 볼 `10×10`, 좌우 플리퍼 `40×12`, 우편 스파크 `12×12`
- 팔레트: `#080b1a`, `#10152b`, `#1d2850`, `#33507a`, `#36b6a2`,
  `#8be0c2`, `#f2a33a`, `#ffd477`, `#e75b55`, `#f2efe2`
- 후가공: 1px 하이라이트, 2×2 Bayer식 디더, 픽셀 클러스터와 제한 팔레트.
  런타임에서는 `roundPixels`, `SCALE_MODE.NEAREST`, CSS
  `image-rendering: pixelated`만 사용하고 평활 보간하지 않는다.
- 사용 위치: `public/art/moonmail-table.png`은 실제 게임 전체 플레이필드의
  기계·월면·레일 정체성을 만들며, `public/art/moonmail-title.png`은 INTRO와
  TITLE 배경, 나머지 PNG는 활성 볼·플리퍼·충돌 이펙트에 사용한다. 재제작
  패스에서 볼을 10×10 청록/호박 외곽선으로 다시 그리고 런타임 픽셀 잔상과
  결합해 별과 스파크에서 분리했다.
- 참고 작품: 플레이 구조는 Bally/Midway `The Addams Family`(1992) 오리지널
  테이블을 기준으로 삼았다. 원작의 로고, 캐릭터, 그래픽, 음원은 복제하거나
  포함하지 않았다.
- SHA-256:
  - `moonmail-table.png`:
    `f3a37caf8fc64a428600664dd35906f745481844473cfb96cdb34ab7c9f4dbae`
  - `moonmail-title.png`:
    `472208ecdfd570b384f80428e3f92ebe2baa912bc3eaf74b007703eaa6fea4e6`
  - `mail-ball.png`: `10b946c698acb788cea875eda2ce8b08181fa029ad95b791a65b5e595ec9be62`
  - `flipper-left.png`:
    `479b658015a8f26ae85bea0ef65ec1d4b2c9c19076e413d77b442dc33a160c83`
  - `flipper-right.png`:
    `a3e50e8e874be4656ffd06bfd3b45313d4c7210dad9371b26bf8702bb280f67e`
  - `mail-spark.png`: `ba413f18c4e309c40a375f831f9118db8101a02ddd8ca518c33e530aabee139f`

## 게임 사운드

- 원본: 녹음·외부 음원 없이 런타임 WebAudio 합성
- 합성·편집 방식: 사각파 솔레노이드, 짧은 필터 노이즈 충돌음, 삼각파 차임,
  멀티볼 상승 아르페지오를 오실레이터·게인·필터로 실시간 합성한다.
- 사용 위치: 플리퍼, 발사, 타깃, 범퍼, 램프, 스쿱, 락, 볼 세이브, 작업 완료,
  잭팟, 슈퍼 잭팟과 드레인. 사용자 첫 입력 전 AudioContext를 만들지 않는다.
