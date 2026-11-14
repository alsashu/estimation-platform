| Fields                           | Values & Formula                                                                                                                                                                     | Input Type / Calculation                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Components                       | Requirement: Task Title, Project, Description, Work Group                                                                                                                            | User Input                                                |
| Middleware Inputs                | Small/Medium/Large/NA                                                                                                                                                                | User Input (Dropdown)                                     |
| Application                      | Small/Medium/Large/NA                                                                                                                                                                | User Input (Dropdown)                                     |
| System Configuration             | Small/Medium/Large/NA                                                                                                                                                                | User Input (Dropdown)                                     |
| Data and Control Flow            | Small/Medium/Large/NA                                                                                                                                                                | User Input (Dropdown)                                     |
| Use case                         | Small/Medium/Large/NA                                                                                                                                                                | User Input (Dropdown)                                     |
| Team Efficiency                  | 1/0.8/0.5                                                                                                                                                                            | User Input (Dropdown) [1 = 100%, 0.8 = 80% and 0.5 = 50%] |
| Multiplier                       | 1/Team Efficiency                                                                                                                                                                    | System Calculation                                        |
| Detailed Estimation (PersonDays) | Multiplier\* SUM (Middleware Inputs + Application + System Configuration + Data and Control Flow + Use case)                                                                         | System Calculation                                        |
| Average Estimation (PersonDays)  | Multiplier\* SUM (MDW APIs + Application + MDW Configuration + MDW API Order of Usage + Use Case)                                                                                    | System Calculation                                        |
| Final Estimation (PersonDays)    | IF(Detailed Estimation (PersonDays) > Average Estimation (PersonDays))<br/>{<br/>  Detailed Estimation (PersonDays)<br/>}<br/>else<br/>{<br/>  Average Estimation (PersonDays)<br/>} | System Calculation                                        |


| Detailed Estimation   | Formula                                                                                                                   | Calculation        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Middleware Inputs     | IF(Middleware Inputs = "Small", 10,IF(Middleware Inputs = "Medium",20, IF(Middleware Inputs = "Large",30,0)))             | System Calculation |
| Application           | IF(Application = "Small", 20,IF(Application = "Medium",35, IF(Application = "Large",50,0)))                               | System Calculation |
| System Configuration  | IF(System Configuration = "Small", 0,IF(System Configuration = "Medium",0, IF(System Configuration = "Large",0,0)))       | System Calculation |
| Data and Control Flow | IF(Data and Control Flow = "Small", 10,IF(Data and Control Flow = "Medium",30, IF(Data and Control Flow = "Large",40,0))) | System Calculation |
| Use case              | IF(Use case="Small", 10,IF(Use case="Medium",15, IF(Use case="Large",20,0)))                                              | System Calculation |


| Average Estimation     | Formula                                                                                                                     | Calculation        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| MDW APIs               | IF(Middleware Inputs = "Small", 12,IF(Middleware Inputs = "Medium",22, IF(Middleware Inputs = "Large",32.5,0)))             | System Calculation |
| Application            | IF(Application = "Small", 12,IF(Application = "Medium",22, IF(Application = "Large",32.5,0)))                               | System Calculation |
| MDW Configuration      | IF(System Configuration = "Small", 12,IF(System Configuration = "Medium",22, IF(System Configuration = "Large",32.5,0)))    | System Calculation |
| MDW API Order of Usage | IF(Data and Control Flow = "Small", 12,IF(Data and Control Flow = "Medium",22, IF(Data and Control Flow = "Large",32.5,0))) | System Calculation |
| Use Case               | IF(Use case = "Small", 12,IF(Use case = "Medium",22, IF(Use case = "Large",32.5,0)))                                        | System Calculation |

## Average

Average values should be dynamic, following are the default values, and admin should have option to save there configuration by name for example eiter user select project ASW or CAA on befalf of that calculation should be mapped. These values is used in the Average Estimation


| Small  | 12   |
| ------ | ---- |
| Medium | 22   |
| Large  | 32.5 |

## Master Data (Expert Judgement)

Master data should be dynamic here I have given example for 2 different project ASW and CAA, the same values is considered for all the above calculation, following are the default values, and admin should have option to save there configuration by name for example eiter user select project ASW or CAA on befalf of that calculation should be mapped. These values is used in the Detailed Estimation



| ASW    | Middleware Inputs | Application | System Configuration | Data and Control Flow | Use case |
| ------ | ----------------- | ----------- | -------------------- | --------------------- | -------- |
| Small  | 10                | 20          | 0                    | 10                    | 10       |
| Medium | 20                | 35          | 0                    | 30                    | 15       |
| Large  | 30                | 50          | 0                    | 40                    | 20       |


| CAA    | Middleware Inputs | Application | System Configuration | Data and Control Flow | Use case |
| ------ | ----------------- | ----------- | -------------------- | --------------------- | -------- |
| Small  | 0                 | 10          | 5                    | 0                     | 10       |
| Medium | 0                 | 30          | 10                   | 0                     | 15       |
| Large  | 0                 | 50          | 20                   | 0                     | 20       |
