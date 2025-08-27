;; RoyaltyDistributor: Distributes royalties to song contributors based on predefined percentages
(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-PAUSED (err u101))
(define-constant ERR-INVALID-SONG (err u102))
(define-constant ERR-INVALID-AMOUNT (err u103))
(define-constant ERR-INVALID-CONTRIBUTOR (err u104))
(define-constant ERR-ALREADY-REGISTERED (err u105))
(define-constant ERR-DISTRIBUTION-FAILED (err u106))

(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var payment-counter uint u0)

;; Maps
(define-map songs
  { song-id: uint }
  { 
    title: (string-ascii 100),
    artist: principal,
    ipfs-hash: (string-ascii 46),
    contributors: (list 10 { contributor: principal, percentage: uint }),
    created-at: uint
  }
)

(define-map royalties
  { song-id: uint, payment-id: uint }
  {
    amount: uint,
    timestamp: uint,
    distributor: principal
  }
)

(define-map contributor-balances
  { song-id: uint, contributor: principal }
  { total-received: uint }
)

;; Public Functions
(define-public (distribute-royalties (song-id uint) (amount uint))
  (let
    (
      (song (unwrap! (map-get? songs { song-id: song-id }) ERR-INVALID-SONG))
      (payment-id (var-get payment-counter))
      (total-percentage (fold + (map (lambda (c) (get percentage c)) (get contributors song)) u0))
    )
    (asserts! (not (var-get paused)) ERR-PAUSED)
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (is-eq total-percentage u100) ERR-INVALID-SONG)
    
    ;; Transfer royalties to each contributor
    (try! (fold distribute-to-contributor (get contributors song) (ok amount)))
    
    ;; Record payment
    (map-insert royalties 
      { song-id: song-id, payment-id: payment-id }
      {
        amount: amount,
        timestamp: block-height,
        distributor: tx-sender
      }
    )
    (var-set payment-counter (+ payment-id u1))
    (ok payment-id)
  )
)

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-UNAUTHORIZED)
    (var-set paused true)
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-UNAUTHORIZED)
    (var-set paused false)
    (ok true)
  )
)

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-UNAUTHORIZED)
    (var-set admin new-admin)
    (ok true)
  )
)

;; Private Functions
(define-private (distribute-to-contributor (contributor { contributor: principal, percentage: uint }) (prev-result (response uint uint)))
  (let
    (
      (amount (unwrap! prev-result ERR-DISTRIBUTION-FAILED))
      (recipient (get contributor contributor))
      (share (/ (* amount (get percentage contributor)) u100))
      (current-balance (default-to u0 (get total-received (map-get? contributor-balances { song-id: (get song-id (map-get? songs { song-id: (get song-id (unwrap! prev-result ERR-DISTRIBUTION-FAILED)) })), contributor: recipient }))))
    )
    (asserts! (> share u0) ERR-INVALID-AMOUNT)
    (try! (stx-transfer? share tx-sender recipient))
    (map-set contributor-balances
      { song-id: (get song-id (map-get? songs { song-id: (get song-id (unwrap! prev-result ERR-DISTRIBUTION-FAILED)) })), contributor: recipient }
      { total-received: (+ current-balance share) }
    )
    (ok amount)
  )
)

;; Read-Only Functions
(define-read-only (get-royalty-history (song-id uint) (payment-id uint))
  (map-get? royalties { song-id: song-id, payment-id: payment-id })
)

(define-read-only (get-contributor-balance (song-id uint) (contributor principal))
  (default-to u0 (get total-received (map-get? contributor-balances { song-id: song-id, contributor: contributor })))
)

(define-read-only (is-paused)
  (var-get paused)
)

(define-read-only (get-admin)
  (var-get admin)
)

(define-read-only (get-payment-counter)
  (var-get payment-counter)
)