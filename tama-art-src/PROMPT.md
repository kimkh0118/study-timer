# 다마고치+ 그림 요청서 (ChatGPT 이미지 생성용)

`raw/`의 원본은 모두 ChatGPT 이미지 생성으로 그렸어요. 다시 그리거나 종을 늘릴 때 아래 문장을 그대로 쓰면 같은 느낌으로 나와요.
자르는 방법은 [make.md](../make.md)의 "그림 추가 · 바꾸기"에 있어요.

## 공통 스타일

- 귀엽고 부드러운 2D 컬러 일러스트, 파스텔 톤, 큰 눈과 볼터치, 부드러운 갈색 외곽선
- **배경은 순수한 흰색**, 글자 · 워터마크 · 테두리 없음
- 생물끼리 **넉넉히 떨어지게**(붙어 있으면 자르기가 어려워요)
- 실존 캐릭터 · 브랜드와 닮지 않은 오리지널 디자인

## 공룡 (3종씩 한 장)

> ONE image, 3 rows x 3 columns (baby / juvenile / adult), same cute style, pure white background, generous empty space between every creature: row 1 = …; row 2 = …; row 3 = ….

| 파일 | 줄 1 | 줄 2 | 줄 3 |
|---|---|---|---|
| `rex.png` · `trike.png` · `stego.png` · `anky.png` · `bronto.png` · `micro.png` | (한 장에 한 종, 가로 3마리) | | |
| `grid_para_raptor_ptera.png` | pink Parasaurolophus | purple feathered Velociraptor | sky-blue Pteranodon |
| `grid_spino_pachy_iguano.png` | teal Spinosaurus with coral sail | peach Pachycephalosaurus | green Iguanodon |
| `grid_diplo_carno_dilo.png` | mint Diplodocus | red Carnotaurus | yellow-green Dilophosaurus |
| `grid_ovi_therizino_galli.png` | orange feathered Oviraptor | cream fluffy Therizinosaurus | beige Gallimimus |
| `grid_maia_proto_kentro.png` | rose-brown Maiasaura | yellow Protoceratops | olive-green Kentrosaurus |
| `grid_archae_mosa_plesio.png` | rainbow Archaeopteryx | deep blue Mosasaurus (on the ground) | aqua Plesiosaurus (on the ground) |

## 화면 그림

| 파일 | 요청 요약 | 결과 |
|---|---|---|
| `eggs.png` | 4×3 격자 공룡 알 12개, 색 · 무늬 모두 다르게, 진한 외곽선, 그림자 없음 | `ui/egg_0~11.png` (`egg_10`은 다른 알과 겹치지 않게 푸른색으로 바꿈) |
| `food.png` | 한 줄 3개: 별사탕 한 줌 / 김 나는 밥 한 그릇 / 무지개 케이크 | `ui/food_snack · meal · feast.png` |
| `nest.png` | 비어 있는 넓고 얕은 나뭇가지 둥지, 잎과 작은 꽃 | `ui/nest.png` |
| `meadow.png` | 햇살 가득한 호숫가 초원 | `ui/meadow.png` (펫 창 배경) |
| `farm.png` | 3:1 파노라마 목장(울타리 · 빨간 헛간), 동물 없음 | `ui/farm.png` (농장 배경) |
| `farewell.png` | 풀밭 위 깨진 알껍데기와 위로 떠오르는 별, 밤하늘 빛 | `ui/farewell.png` (작별 화면) |
