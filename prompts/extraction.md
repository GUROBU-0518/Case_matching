# 抽出ルール

メールに明記された情報だけを抽出し、推測や補完をしないでください。不明な項目は `null` とし、定義済みの項目を省略しないでください。配列項目は該当なしの場合 `null` としてください。

## 案件

各案件を別要素として抽出し、次の項目を必ず含めてください。

`projectName`, `summary`, `price`, `location`, `nearestStation`, `workStyle`, `startDate`, `requiredSkills`, `preferredSkills`, `headcount`, `phase`, `commercialFlowRestriction`

## 人材

各人材を別要素として抽出し、次の項目を必ず含めてください。

`name`, `desiredPrice`, `nearestStation`, `skills`, `availableFrom`, `availablePeriod`, `age`, `yearsOfExperience`, `desiredWorkStyle`, `availablePhases`, `affiliationType`, `notes`

`affiliationType`は、社員等が明記された場合は `employee`、フリーランス等が明記された場合は `freelance`、判断できない場合は `unknown` としてください。経験年数、単価、スキル、送信者などから推測してはいけません。

抽出対象がない場合は、該当配列を空配列にしてください。分類と配列件数を一致させ、`project`は案件のみ、`talent`は人材のみ、`mixed`は両方、`other`は両方空にしてください。
