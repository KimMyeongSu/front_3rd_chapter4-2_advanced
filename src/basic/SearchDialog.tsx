import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import {
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
  Table,
  Tag,
  TagCloseButton,
  TagLabel,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  Wrap,
} from "@chakra-ui/react"
import { useScheduleContext } from "./ScheduleContext.tsx"
import { Lecture } from "./types.ts"
import { parseSchedule } from "./utils.ts"
import axios from "axios"
import { DAY_LABELS } from "./constants.ts"

interface Props {
  searchInfo: {
    tableId: string
    day?: string
    time?: number
  } | null
  onClose: () => void
}

interface SearchOption {
  query?: string
  grades: number[]
  days: string[]
  times: number[]
  majors: string[]
  credits?: number
}

const TIME_SLOTS = [
  { id: 1, label: "09:00~09:30" },
  { id: 2, label: "09:30~10:00" },
  { id: 3, label: "10:00~10:30" },
  { id: 4, label: "10:30~11:00" },
  { id: 5, label: "11:00~11:30" },
  { id: 6, label: "11:30~12:00" },
  { id: 7, label: "12:00~12:30" },
  { id: 8, label: "12:30~13:00" },
  { id: 9, label: "13:00~13:30" },
  { id: 10, label: "13:30~14:00" },
  { id: 11, label: "14:00~14:30" },
  { id: 12, label: "14:30~15:00" },
  { id: 13, label: "15:00~15:30" },
  { id: 14, label: "15:30~16:00" },
  { id: 15, label: "16:00~16:30" },
  { id: 16, label: "16:30~17:00" },
  { id: 17, label: "17:00~17:30" },
  { id: 18, label: "17:30~18:00" },
  { id: 19, label: "18:00~18:50" },
  { id: 20, label: "18:55~19:45" },
  { id: 21, label: "19:50~20:40" },
  { id: 22, label: "20:45~21:35" },
  { id: 23, label: "21:40~22:30" },
  { id: 24, label: "22:35~23:25" },
]

const PAGE_SIZE = 100

const fetchMajors = () => axios.get<Lecture[]>("/schedules-majors.json")
const fetchLiberalArts = () => axios.get<Lecture[]>("/schedules-liberal-arts.json")
/**
 * 불필요한 중복 API 호출 제거 (6회 → 2회)
 * Promise.all 내부의 await 제거하여 올바른 병렬 처리
 * Map을 사용하여  중복 제거
 * 성능 측정 콘솔 추가
 */
const fetchAllLectures = async () => {
  const startTime = performance.now()
  console.log("API 호출 시작:", startTime)

  try {
    const [majorsData, liberalArtsData] = await Promise.all([fetchMajors(), fetchLiberalArts()])

    const endTime = performance.now()
    console.log("API 호출 완료:", endTime)
    console.log("소요 시간(ms):", endTime - startTime)

    const allLectures = [...majorsData.data, ...liberalArtsData.data]
    const uniqueLectures = Array.from(new Map(allLectures.map((lecture) => [lecture.id, lecture])).values())

    return uniqueLectures
  } catch (error) {
    console.error("강의 데이터 로딩 실패:", error)
    return []
  }
}

// TODO: 이 컴포넌트에서 불필요한 연산이 발생하지 않도록 다양한 방식으로 시도해주세요.
const SearchDialog = ({ searchInfo, onClose }: Props) => {
  const { setSchedulesMap } = useScheduleContext()

  const loaderWrapperRef = useRef<HTMLDivElement>(null)
  const loaderRef = useRef<HTMLDivElement>(null)
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [page, setPage] = useState(1)
  const [searchOptions, setSearchOptions] = useState<SearchOption>({
    query: "",
    grades: [],
    days: [],
    times: [],
    majors: [],
  })

  // 1. useMemo를 사용하여 필터링 로직 최적화
  // searchOptions나 lectures가 변경될 때만 재계산
  const filteredLectures = useMemo(() => {
    const { query = "", credits, grades, days, times, majors } = searchOptions
    const lowercaseQuery = query.toLowerCase()

    return (
      lectures
        // 2. 검색어 필터링 최적화: toLowerCase() 한 번만 호출
        .filter(
          (lecture) =>
            lecture.title.toLowerCase().includes(lowercaseQuery) || lecture.id.toLowerCase().includes(lowercaseQuery)
        )
        .filter((lecture) => grades.length === 0 || grades.includes(lecture.grade))
        .filter((lecture) => majors.length === 0 || majors.includes(lecture.major))
        .filter((lecture) => !credits || lecture.credits.startsWith(String(credits)))
        // 3. 스케줄 파싱 최적화: 필요한 경우에만 parseSchedule 호출
        .filter((lecture) => {
          if (days.length === 0) return true
          const schedules = lecture.schedule ? parseSchedule(lecture.schedule) : []
          return schedules.some((s) => days.includes(s.day))
        })
        .filter((lecture) => {
          if (times.length === 0) return true
          const schedules = lecture.schedule ? parseSchedule(lecture.schedule) : []
          return schedules.some((s) => s.range.some((time) => times.includes(time)))
        })
    )
  }, [searchOptions, lectures])

  // 4. 파생 상태들을 useMemo로 최적화
  const lastPage = useMemo(() => Math.ceil(filteredLectures.length / PAGE_SIZE), [filteredLectures.length])

  const visibleLectures = useMemo(() => filteredLectures.slice(0, page * PAGE_SIZE), [filteredLectures, page])

  const allMajors = useMemo(() => [...new Set(lectures.map((lecture) => lecture.major))], [lectures])

  // 5. 디바운스된 검색어 변경 핸들러
  const debouncedChangeSearchOption = useCallback(
    debounce((field: keyof SearchOption, value: SearchOption[typeof field]) => {
      setPage(1)
      setSearchOptions((prev) => ({ ...prev, [field]: value }))
      loaderWrapperRef.current?.scrollTo(0, 0)
    }, 300),
    []
  )

  // 6. useCallback으로 메모이제이션된 이벤트 핸들러
  const addSchedule = useCallback(
    (lecture: Lecture) => {
      if (!searchInfo) return

      const { tableId } = searchInfo
      const schedules = parseSchedule(lecture.schedule).map((schedule) => ({
        ...schedule,
        lecture,
      }))

      setSchedulesMap((prev) => ({
        ...prev,
        [tableId]: [...prev[tableId], ...schedules],
      }))

      onClose()
    },
    [searchInfo, setSchedulesMap, onClose]
  )

  // 7. API 데이터 캐싱
  const lecturesCache = useRef<Lecture[]>([])

  useEffect(() => {
    // 캐시된 데이터가 있으면 재사용
    if (lecturesCache.current.length > 0) {
      setLectures(lecturesCache.current)
      return
    }

    fetchAllLectures().then((results) => {
      lecturesCache.current = results
      setLectures(results)
    })
  }, [])

  // 8. Intersection Observer 로직 최적화
  useEffect(() => {
    const $loader = loaderRef.current
    const $loaderWrapper = loaderWrapperRef.current

    if (!$loader || !$loaderWrapper) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setPage((prev) => Math.min(lastPage, prev + 1))
        }
      },
      { threshold: 0, root: $loaderWrapper }
    )

    observer.observe($loader)
    return () => observer.unobserve($loader)
  }, [lastPage])

  // 9. searchInfo 변경 시 검색 옵션 업데이트 최적화
  useEffect(() => {
    setSearchOptions((prev) => ({
      ...prev,
      days: searchInfo?.day ? [searchInfo.day] : [],
      times: searchInfo?.time ? [searchInfo.time] : [],
    }))
    setPage(1)
  }, [searchInfo])

  return (
    <Modal isOpen={Boolean(searchInfo)} onClose={onClose} size="6xl">
      <ModalOverlay />
      <ModalContent maxW="90vw" w="1000px">
        <ModalHeader>수업 검색</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <HStack spacing={4}>
              <FormControl>
                <FormLabel>검색어</FormLabel>
                <Input
                  placeholder="과목명 또는 과목코드"
                  value={searchOptions.query}
                  onChange={(e) => debouncedChangeSearchOption("query", e.target.value)}
                />
              </FormControl>

              <FormControl>
                <FormLabel>학점</FormLabel>
                <Select
                  value={searchOptions.credits}
                  onChange={(e) => debouncedChangeSearchOption("credits", e.target.value)}
                >
                  <option value="">전체</option>
                  <option value="1">1학점</option>
                  <option value="2">2학점</option>
                  <option value="3">3학점</option>
                </Select>
              </FormControl>
            </HStack>

            <HStack spacing={4}>
              <FormControl>
                <FormLabel>학년</FormLabel>
                <CheckboxGroup
                  value={searchOptions.grades}
                  onChange={(value) => debouncedChangeSearchOption("grades", value.map(Number))}
                >
                  <HStack spacing={4}>
                    {[1, 2, 3, 4].map((grade) => (
                      <Checkbox key={grade} value={grade}>
                        {grade}학년
                      </Checkbox>
                    ))}
                  </HStack>
                </CheckboxGroup>
              </FormControl>

              <FormControl>
                <FormLabel>요일</FormLabel>
                <CheckboxGroup
                  value={searchOptions.days}
                  onChange={(value) => debouncedChangeSearchOption("days", value as string[])}
                >
                  <HStack spacing={4}>
                    {DAY_LABELS.map((day) => (
                      <Checkbox key={day} value={day}>
                        {day}
                      </Checkbox>
                    ))}
                  </HStack>
                </CheckboxGroup>
              </FormControl>
            </HStack>

            <HStack spacing={4}>
              <FormControl>
                <FormLabel>시간</FormLabel>
                <CheckboxGroup
                  colorScheme="green"
                  value={searchOptions.times}
                  onChange={(values) => debouncedChangeSearchOption("times", values.map(Number))}
                >
                  <Wrap spacing={1} mb={2}>
                    {searchOptions.times
                      .sort((a, b) => a - b)
                      .map((time) => (
                        <Tag key={time} size="sm" variant="outline" colorScheme="blue">
                          <TagLabel>{time}교시</TagLabel>
                          <TagCloseButton
                            onClick={() =>
                              debouncedChangeSearchOption(
                                "times",
                                searchOptions.times.filter((v) => v !== time)
                              )
                            }
                          />
                        </Tag>
                      ))}
                  </Wrap>
                  <Stack
                    spacing={2}
                    overflowY="auto"
                    h="100px"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius={5}
                    p={2}
                  >
                    {TIME_SLOTS.map(({ id, label }) => (
                      <Box key={id}>
                        <Checkbox key={id} size="sm" value={id}>
                          {id}교시({label})
                        </Checkbox>
                      </Box>
                    ))}
                  </Stack>
                </CheckboxGroup>
              </FormControl>

              <FormControl>
                <FormLabel>전공</FormLabel>
                <CheckboxGroup
                  colorScheme="green"
                  value={searchOptions.majors}
                  onChange={(values) => debouncedChangeSearchOption("majors", values as string[])}
                >
                  <Wrap spacing={1} mb={2}>
                    {searchOptions.majors.map((major) => (
                      <Tag key={major} size="sm" variant="outline" colorScheme="blue">
                        <TagLabel>{major.split("<p>").pop()}</TagLabel>
                        <TagCloseButton
                          onClick={() =>
                            debouncedChangeSearchOption(
                              "majors",
                              searchOptions.majors.filter((v) => v !== major)
                            )
                          }
                        />
                      </Tag>
                    ))}
                  </Wrap>
                  <Stack
                    spacing={2}
                    overflowY="auto"
                    h="100px"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius={5}
                    p={2}
                  >
                    {allMajors.map((major) => (
                      <Box key={major}>
                        <Checkbox key={major} size="sm" value={major}>
                          {major.replace(/<p>/gi, " ")}
                        </Checkbox>
                      </Box>
                    ))}
                  </Stack>
                </CheckboxGroup>
              </FormControl>
            </HStack>
            <Text align="right">검색결과: {filteredLectures.length}개</Text>
            <Box>
              <Table>
                <Thead>
                  <Tr>
                    <Th width="100px">과목코드</Th>
                    <Th width="50px">학년</Th>
                    <Th width="200px">과목명</Th>
                    <Th width="50px">학점</Th>
                    <Th width="150px">전공</Th>
                    <Th width="150px">시간</Th>
                    <Th width="80px"></Th>
                  </Tr>
                </Thead>
              </Table>

              <Box overflowY="auto" maxH="500px" ref={loaderWrapperRef}>
                <Table size="sm" variant="striped">
                  <Tbody>
                    {visibleLectures.map((lecture, index) => (
                      <Tr key={`${lecture.id}-${index}`}>
                        <Td width="100px">{lecture.id}</Td>
                        <Td width="50px">{lecture.grade}</Td>
                        <Td width="200px">{lecture.title}</Td>
                        <Td width="50px">{lecture.credits}</Td>
                        <Td width="150px" dangerouslySetInnerHTML={{ __html: lecture.major }} />
                        <Td width="150px" dangerouslySetInnerHTML={{ __html: lecture.schedule }} />
                        <Td width="80px">
                          <Button size="sm" colorScheme="green" onClick={() => addSchedule(lecture)}>
                            추가
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                <Box ref={loaderRef} h="20px" />
              </Box>
            </Box>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}

// 10. 디바운스 유틸리티 함수
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout

  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

export default SearchDialog
