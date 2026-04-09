from hathor import (
    Address, Amount, Blueprint, Context, NCDepositAction, NCFail,
    NCWithdrawalAction, Timestamp, TokenUid, export, public, view
)

PHASE_LOCKED = 'LOCKED'
PHASE_RELEASED = 'RELEASED'
PHASE_REFUNDED = 'REFUNDED'


@export
class X402Escrow(Blueprint):
    buyer: Address
    seller: Address
    facilitator: Address
    token_uid: TokenUid
    amount: Amount
    phase: str
    deadline: Timestamp
    resource_url: str
    request_hash: str

    @public(allow_deposit=True)
    def initialize(
        self,
        ctx: Context,
        seller: Address,
        facilitator: Address,
        token_uid: TokenUid,
        deadline: Timestamp,
        resource_url: str,
        request_hash: str,
    ) -> None:
        action = ctx.get_single_action(token_uid)
        if not isinstance(action, NCDepositAction):
            raise NCFail("Must include a deposit action")

        self.buyer = ctx.get_caller_address()
        self.seller = seller
        self.facilitator = facilitator
        self.token_uid = token_uid
        self.amount = action.amount
        self.phase = PHASE_LOCKED
        self.deadline = deadline
        self.resource_url = resource_url
        self.request_hash = request_hash

    @public(allow_withdrawal=True)
    def release(self, ctx: Context) -> None:
        # Exact release: withdraw the entire escrow amount to the seller.
        # Used by the "hathor-escrow" (exact) scheme.
        caller = ctx.get_caller_address()
        if caller != self.facilitator:
            raise NCFail("Only the facilitator can release funds")
        if self.phase != PHASE_LOCKED:
            raise NCFail("Escrow is not locked")

        action = ctx.get_single_action(self.token_uid)
        if not isinstance(action, NCWithdrawalAction):
            raise NCFail("Must include a withdrawal action")
        if action.amount != self.amount:
            raise NCFail("Withdrawal amount must equal escrow amount")

        self.phase = PHASE_RELEASED

    @public(allow_withdrawal=True)
    def release_upto(self, ctx: Context, charged_amount: Amount) -> None:
        # Partial release: withdraw `charged_amount` to the seller and leave the
        # remainder locked so the buyer (or facilitator) can claim it back via
        # refund(). Used by the "hathor-escrow-upto" scheme.
        #
        # After this call, self.amount becomes the remainder. If the remainder
        # is zero, the phase transitions to RELEASED. Otherwise the phase stays
        # LOCKED and the remaining amount can be refunded to the buyer using
        # the existing refund() flow.
        caller = ctx.get_caller_address()
        if caller != self.facilitator:
            raise NCFail("Only the facilitator can release funds")
        if self.phase != PHASE_LOCKED:
            raise NCFail("Escrow is not locked")
        if charged_amount <= 0:
            raise NCFail("charged_amount must be positive")
        if charged_amount > self.amount:
            raise NCFail("charged_amount exceeds escrow amount")

        action = ctx.get_single_action(self.token_uid)
        if not isinstance(action, NCWithdrawalAction):
            raise NCFail("Must include a withdrawal action")
        if action.amount != charged_amount:
            raise NCFail("Withdrawal amount must equal charged_amount")

        self.amount = self.amount - charged_amount
        if self.amount == 0:
            self.phase = PHASE_RELEASED

    @public(allow_withdrawal=True)
    def refund(self, ctx: Context) -> None:
        caller = ctx.get_caller_address()

        if self.phase != PHASE_LOCKED:
            raise NCFail("Escrow is not locked")

        if caller != self.buyer and caller != self.facilitator:
            if ctx.block.timestamp < self.deadline:
                raise NCFail("Only buyer or facilitator can refund before deadline")

        action = ctx.get_single_action(self.token_uid)
        if not isinstance(action, NCWithdrawalAction):
            raise NCFail("Must include a withdrawal action")
        if action.amount != self.amount:
            raise NCFail("Withdrawal amount must equal escrow amount")

        self.phase = PHASE_REFUNDED

    @view
    def get_phase(self) -> str:
        return self.phase
